/** Offline operator tool. No server authorization rules are modified or bypassed by an HTTP request. */
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { parseArgs } from "node:util";
import { isDeepStrictEqual } from "node:util";
import { and, eq, inArray } from "drizzle-orm";
import { createDb, closeRegisteredClients, agents, heartbeatRuns, agentInstructionHeads, agentInstructionRevisions, type Db } from "@paperclipai/db";
import { planInstructionRelocation, instructionLocation, restoreInstructionLocation } from "../src/lib/migrated-instructions.js";
import { updateAgentConfigurationInTransaction } from "../src/services/agent-configuration-transaction.js";
import { logActivity } from "../src/services/activity-log.js";

const { values } = parseArgs({ options: {
  "company-id": {type: "string"}, "agent-id": {type: "string", multiple: true},
  "from-instance-root": {type: "string"}, "backup-file": {type: "string"},
  "rollback-file": {type: "string"}, apply: {type: "boolean", default: false},
} });
const companyId = values["company-id"];
const ids = [...new Set(values["agent-id"] ?? [])].sort();
if (!companyId || !ids.length || !values["from-instance-root"]) throw new Error("Require --company-id, --agent-id (repeatable), --from-instance-root; default is dry-run");
if (!process.env.PAPERCLIP_CONFIG || !process.env.PAPERCLIP_HOME || !process.env.DATABASE_URL) throw new Error("Use the local-service wrapper with its existing configuration");
const config = JSON.parse(await fs.readFile(process.env.PAPERCLIP_CONFIG, "utf8"));
if (config.database.connectionString !== process.env.DATABASE_URL) throw new Error("Database configuration mismatch");
if (values.apply) {
  if (!values["backup-file"] || !path.isAbsolute(values["backup-file"])) throw new Error("--apply requires a new absolute --backup-file in a private directory");
  const parent = await fs.lstat(path.dirname(values["backup-file"]));
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o077) !== 0 || parent.uid !== process.getuid?.()) throw new Error("Backup directory must be owned by this user with mode 0700");
  const listening = await new Promise<boolean>((resolve, reject) => {
    const socket = net.connect({host: "127.0.0.1", port: Number(config.server.port)});
    socket.setTimeout(1000);
    socket.once("connect", () => {socket.destroy(); resolve(true);});
    socket.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ECONNREFUSED") resolve(false);
      else reject(new Error("Cannot determine whether the local app is stopped"));
    });
    socket.once("timeout", () => {socket.destroy(); resolve(true);});
  });
  if (listening) throw new Error("Stop the local app and all writers before applying relocation");
}
const db = createDb(process.env.DATABASE_URL);
try {
  const selected = await db.select().from(agents).where(and(eq(agents.companyId, companyId), inArray(agents.id, ids)));
  if (selected.length !== ids.length) throw new Error("Selected agents must all exist in the specified company");
  const rollback = values["rollback-file"] ? JSON.parse(await fs.readFile(values["rollback-file"], "utf8")) : null;
  if (rollback && (rollback.companyId !== companyId || rollback.sourceInstanceRoot !== values["from-instance-root"] || !Array.isArray(rollback.plans))) throw new Error("Rollback snapshot scope mismatch");
  async function makePlan(row: typeof selected[number]) {
    if (rollback) {
      const prior = rollback.plans.find((plan: {agentId: string}) => plan.agentId === row.id);
      if (!prior) throw new Error("Agent is missing from rollback snapshot");
      const nextConfig = restoreInstructionLocation(row.adapterConfig, prior.before, prior.after);
      return { agentId: row.id, companyId, before: instructionLocation(row.adapterConfig), after: instructionLocation(nextConfig), nextConfig,
        changed: !isDeepStrictEqual(row.adapterConfig, nextConfig), contentHash: prior.contentHash as string };
    }
    const plan = await planInstructionRelocation(row, values["from-instance-root"]!);
    const [head] = await db.select({hash: agentInstructionRevisions.contentHash}).from(agentInstructionHeads)
      .innerJoin(agentInstructionRevisions, eq(agentInstructionRevisions.id, agentInstructionHeads.revisionId))
      .where(and(eq(agentInstructionHeads.companyId, companyId!), eq(agentInstructionHeads.agentId, row.id), eq(agentInstructionHeads.entryFile, String(plan.after.instructionsEntryFile))));
    if (head && head.hash !== plan.contentHash) throw new Error(`Agent ${row.id}: local entry differs from its canonical revision`);
    return plan;
  }
  const plans: Awaited<ReturnType<typeof makePlan>>[] = [];
  for (const row of selected) plans.push(await makePlan(row));
  if (values.apply && plans.some(plan => plan.changed)) {
    await fs.writeFile(values["backup-file"]!, JSON.stringify({version: 1, companyId, sourceInstanceRoot: values["from-instance-root"],
      createdAt: new Date().toISOString(), agents: selected, plans}, null, 2), {mode: 0o600, flag: "wx"});
    await db.transaction(async tx => {
      for (const id of ids) {
        const [current] = await tx.select().from(agents).where(and(eq(agents.id, id), eq(agents.companyId, companyId))).for("no key update");
        const initial = selected.find(row => row.id === id)!;
        if (!current || !isDeepStrictEqual(current, initial)) throw new Error("Agent changed since inspection; nothing applied");
      }
      const [active] = await tx.select({id: heartbeatRuns.id}).from(heartbeatRuns).where(inArray(heartbeatRuns.status, ["running", "queued"])).limit(1);
      if (active) throw new Error("Active or queued runs exist; nothing applied");
      // Re-read files under the same stopped-writer window, before any update.
      for (const row of selected) {
        const checked = await makePlan(row);
        const initial = plans.find(plan => plan.agentId === row.id)!;
        if (!isDeepStrictEqual(checked, initial)) throw new Error("Instructions changed since inspection; nothing applied");
      }
      for (const plan of plans.filter(plan => plan.changed)) {
        const changed = await updateAgentConfigurationInTransaction(tx as unknown as Db, plan.agentId, {adapterConfig: plan.nextConfig},
          {recordRevision: {source: "local_service_instructions_relocation"}});
        if (!changed) throw new Error("Agent disappeared during repair");
        await logActivity(tx as unknown as Db, {companyId, actorType: "system", actorId: "local-service-maintenance",
          action: "agent.instructions_location_repaired", entityType: "agent", entityId: plan.agentId,
          details: {source: "explicit_offline_migration", rollback: Boolean(rollback), before: plan.before, after: plan.after, contentHash: plan.contentHash}});
      }
    });
  }
  console.log(JSON.stringify({mode: values.apply ? "applied" : "dry-run", companyId,
    plans: plans.map(({agentId, before, after, contentHash, changed}) => ({agentId, before, after, contentHash, changed}))}, null, 2));
} finally {await closeRegisteredClients(process.env.DATABASE_URL);}
