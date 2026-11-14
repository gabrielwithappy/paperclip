import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { instructionPath, readInstructionBytes } from "../services/agent-instruction-files.js";
import { resolveManagedInstructionsRoot, syncInstructionsBundleConfigFromFilePath } from "../services/agent-instructions.js";

export const INSTRUCTION_LOCATION_KEYS = ["instructionsBundleMode", "instructionsRootPath", "instructionsEntryFile", "instructionsFilePath"] as const;
export type Location = Record<string, unknown>;
type Agent = { id: string; companyId: string; name: string; adapterConfig: Record<string, unknown> };
export function instructionLocation(config: Record<string, unknown>): Location {
  return Object.fromEntries(INSTRUCTION_LOCATION_KEYS.filter(key => config[key] !== undefined).map(key => [key, config[key]]));
}

/** Explicit offline relocation, never used to relax API authorization. */
export async function planInstructionRelocation(agent: Agent, sourceInstanceRoot: string) {
  if (!path.isAbsolute(sourceInstanceRoot) || path.normalize(sourceInstanceRoot) !== sourceInstanceRoot) throw new Error("Use a normalized absolute source instance root");
  if (![agent.companyId, agent.id].every(id => /^[a-zA-Z0-9_-]+$/.test(id))) throw new Error("Invalid company or agent ID");
  const config = agent.adapterConfig;
  const entry = instructionPath(typeof config.instructionsEntryFile === "string" ? config.instructionsEntryFile : "AGENTS.md");
  const oldRoot = path.join(sourceInstanceRoot, "companies", agent.companyId, "agents", agent.id, "instructions");
  const newRoot = resolveManagedInstructionsRoot(agent);
  const newFile = path.join(newRoot, entry);
  const alreadyRepaired = config.instructionsBundleMode === "managed" && config.instructionsRootPath === newRoot && config.instructionsFilePath === newFile;
  if (!alreadyRepaired && (config.instructionsFilePath !== path.join(oldRoot, entry)
    || (config.instructionsRootPath !== undefined && config.instructionsRootPath !== oldRoot)
    || (config.instructionsBundleMode !== undefined && !["managed", "external"].includes(String(config.instructionsBundleMode))))) {
    throw new Error(`Agent ${agent.id}: instructions do not match its declared source location`);
  }
  const bytes = await readInstructionBytes(newRoot, entry);
  if (bytes === null) throw new Error(`Agent ${agent.id}: migrated entry file is missing`);
  const nextConfig = syncInstructionsBundleConfigFromFilePath(agent, { ...config, instructionsFilePath: newFile });
  return { agentId: agent.id, companyId: agent.companyId, before: instructionLocation(config), after: instructionLocation(nextConfig),
    contentHash: createHash("sha256").update(bytes).digest("hex"), changed: !isDeepStrictEqual(config, nextConfig), nextConfig };
}

/** Restore only location fields; reject intervening location edits, retain newer env/model. */
export function restoreInstructionLocation(config: Record<string, unknown>, before: Location, after: Location) {
  if (!isDeepStrictEqual(instructionLocation(config), after)) throw new Error("Instructions location changed after repair; refusing rollback");
  const restored = { ...config };
  for (const key of INSTRUCTION_LOCATION_KEYS) {
    delete restored[key];
    if (Object.hasOwn(before, key)) restored[key] = before[key];
  }
  return restored;
}
