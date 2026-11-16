import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agents, companies, createDb, issueComments, issueRecoveryActions, issueRelations, issues, agentWakeupRequests } from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "../../__tests__/helpers/embedded-postgres.js";
import { deliverDelegatedRecoveryFeedback, registerDelegatedRecoveryFeedback } from "./delegated-feedback.js";
import { createDeliveryWorkCoordinator } from "../delivery-work-coordinator.js";
import { issueRecoveryActionService } from "../issue-recovery-actions.js";

const support = await getEmbeddedPostgresTestSupport();
describe.skipIf(!support.supported)("delegated recovery feedback", () => {
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  beforeAll(async () => { database = await startEmbeddedPostgresTestDatabase("delegated-feedback-"); db = createDb(database.connectionString); }, 90_000);
  afterAll(async () => { await db?.$client.end(); await database?.cleanup(); });
  async function seed() {
    const companyId = randomUUID(), sourceId = randomUUID(), callerId = randomUUID(), agentId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Feedback", issuePrefix: `F${companyId.replaceAll("-", "")}` });
    await db.insert(agents).values({ id: agentId, companyId, name: "Paused caller", role: "engineer", status: "paused" });
    await db.insert(issues).values([
      { id: callerId, companyId, title: "Caller", status: "blocked", assigneeAgentId: agentId },
      { id: sourceId, companyId, title: "Callee", status: "in_progress", parentId: callerId },
    ]);
    await db.insert(issueRelations).values({ companyId, issueId: sourceId, relatedIssueId: callerId, type: "blocks" });
    const [action] = await db.insert(issueRecoveryActions).values({ companyId, sourceIssueId: sourceId,
      kind: "active_run_watchdog", ownerType: "board", status: "resolved", outcome: "blocked",
      cause: "legacy_execution_requires_reconciliation", fingerprint: randomUUID(),
      evidence: { runId: randomUUID(), automaticRecovery: { replay: "blocked" } }, nextAction: "Inspect recovery." }).returning();
    return { companyId, sourceId, callerId, agentId, id: action.id };
  }
  async function comments(companyId: string) { return db.select().from(issueComments).where(eq(issueComments.companyId, companyId)); }
  it("notifies dependents once under concurrent delivery without restarting a paused caller", async () => {
    const f = await seed();
    const [structural] = await db.insert(issues).values({ companyId: f.companyId, title: "Structural parent", status: "in_progress" }).returning();
    await db.update(issues).set({ parentId: structural.id }).where(eq(issues.id, f.sourceId));
    await Promise.all([deliverDelegatedRecoveryFeedback(db, f), deliverDelegatedRecoveryFeedback(db, f)]);
    expect((await comments(f.companyId)).map(c => c.issueId).sort()).toEqual([f.sourceId, f.callerId].sort());
    expect(await db.select().from(agentWakeupRequests).where(eq(agentWakeupRequests.companyId, f.companyId))).toHaveLength(0);
    await db.update(issueRecoveryActions).set({ evidence: sql`${issueRecoveryActions.evidence} - 'delegatedFeedbackIncident'` }).where(eq(issueRecoveryActions.id, f.id));
    await deliverDelegatedRecoveryFeedback(db, f);
    expect(await comments(f.companyId)).toHaveLength(2);
  });
  it("does not widen private evidence or notify completed callers or another company", async () => {
    const f = await seed();
    await db.update(issues).set({ visibility: "private", privacyRootIssueId: f.sourceId }).where(eq(issues.id, f.sourceId));
    await deliverDelegatedRecoveryFeedback(db, f);
    expect((await comments(f.companyId)).map(c => c.issueId)).toEqual([f.sourceId]);
    const g = await seed();
    await db.update(issues).set({ status: "cancelled" }).where(eq(issues.id, g.callerId));
    await deliverDelegatedRecoveryFeedback(db, g);
    expect((await comments(g.companyId)).map(c => c.issueId)).toEqual([g.sourceId]);
    await deliverDelegatedRecoveryFeedback(db, { id: g.id, companyId: f.companyId });
    expect(await comments(g.companyId)).toHaveLength(1);
  });
  it("rolls back partial notices and recovers after delivery failure", async () => {
    const f = await seed();
    await db.execute(sql.raw(`create function delegated_feedback_fail() returns trigger language plpgsql as $$ begin
      if new.issue_id = '${f.callerId}'::uuid then raise exception 'synthetic feedback failure'; end if; return new; end $$`));
    await db.execute(sql`create trigger delegated_feedback_fail before insert on issue_comments for each row execute function delegated_feedback_fail()`);
    try { await expect(deliverDelegatedRecoveryFeedback(db, f)).rejects.toThrow(); expect(await comments(f.companyId)).toHaveLength(0); }
    finally { await db.execute(sql`drop trigger delegated_feedback_fail on issue_comments`); await db.execute(sql`drop function delegated_feedback_fail()`); }
    await deliverDelegatedRecoveryFeedback(db, f);
    expect(await comments(f.companyId)).toHaveLength(2);
  });
  it("reconstructs undelivered incidents, goes idle, and wakes on a normal producer", async () => {
    const f = await seed();
    const coordinator = createDeliveryWorkCoordinator({ owner: db, canRun: () => true, onError: error => { throw error; } });
    const worker = registerDelegatedRecoveryFeedback(db, coordinator, () => true);
    try {
      await worker.ready;
      expect(await comments(f.companyId)).toHaveLength(2);
      expect(coordinator.nextWakeAt()).toBeNull();
      const [source] = await db.insert(issues).values({ companyId: f.companyId, title: "Later incident", status: "blocked" }).returning();
      await issueRecoveryActionService(db).upsertSourceScoped({ companyId: f.companyId, sourceIssueId: source.id,
        kind: "active_run_watchdog", ownerType: "board", cause: "legacy_execution_requires_reconciliation",
        fingerprint: randomUUID(), evidence: { runId: randomUUID() }, nextAction: "Inspect recovery." });
      await expect.poll(async () => (await comments(f.companyId)).filter(c => c.issueId === source.id).length).toBe(1);
      await expect.poll(() => coordinator.nextWakeAt()).toBeNull();
    } finally { await worker.stop(); await coordinator.stop(); }
  });
});
