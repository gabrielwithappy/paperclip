import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { planInstructionRelocation, restoreInstructionLocation } from "../lib/migrated-instructions.js";
import { agentInstructionsBundleMode, resolveManagedInstructionsRoot } from "../services/agent-instructions.js";
import { assertInstanceAdmin } from "../routes/authz.js";

describe("offline migrated instructions relocation", () => {
  const originalHome = process.env.PAPERCLIP_HOME;
  const originalInstance = process.env.PAPERCLIP_INSTANCE_ID;
  let home: string;
  const source = "/old/instances/default";
  const oldRoot = `${source}/companies/company-1/agents/agent-1/instructions`;
  const makeAgent = (mode = "managed") => ({ id: "agent-1", companyId: "company-1", name: "Agent", adapterConfig: {
    instructionsBundleMode: mode, instructionsRootPath: oldRoot, instructionsEntryFile: "AGENTS.md", instructionsFilePath: `${oldRoot}/AGENTS.md`,
    env: { TZ: {type: "plain", value: "Asia/Seoul"} }, model: "old-model", paperclipSkillSync: {desiredSkills: ["keep"]},
  } as Record<string, unknown> });
  beforeEach(async () => {
    home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "relocate-instructions-")));
    process.env.PAPERCLIP_HOME = home;
    process.env.PAPERCLIP_INSTANCE_ID = "default";
    const root = resolveManagedInstructionsRoot(makeAgent());
    await fs.mkdir(root, {recursive: true});
    await fs.writeFile(path.join(root, "AGENTS.md"), "# Keep exact contents\n");
  });
  afterEach(async () => {
    if (originalHome === undefined) delete process.env.PAPERCLIP_HOME; else process.env.PAPERCLIP_HOME = originalHome;
    if (originalInstance === undefined) delete process.env.PAPERCLIP_INSTANCE_ID; else process.env.PAPERCLIP_INSTANCE_ID = originalInstance;
    await fs.rm(home, {recursive: true, force: true});
  });
  it.each(["managed", "external"])("repairs a verified former canonical %s location without changing credentials or contents", async mode => {
    const agent = makeAgent(mode);
    expect(agentInstructionsBundleMode(agent)).toBe("external");
    expect(() => assertInstanceAdmin({actor: {type: "board", isInstanceAdmin: false}} as never)).toThrow("Instance admin access required");
    const result = await planInstructionRelocation(agent, source);
    expect(result.changed).toBe(true);
    expect(agentInstructionsBundleMode({...agent, adapterConfig: result.nextConfig})).toBe("managed");
    expect(result.nextConfig.env).toEqual(agent.adapterConfig.env);
    expect(result.nextConfig.model).toBe("old-model");
    expect(result.nextConfig.paperclipSkillSync).toEqual(agent.adapterConfig.paperclipSkillSync);
    expect(await fs.readFile(String(result.nextConfig.instructionsFilePath), "utf8")).toBe("# Keep exact contents\n");
    expect((await planInstructionRelocation({...agent, adapterConfig: result.nextConfig}, source)).changed).toBe(false);
    expect(agent.adapterConfig.instructionsRootPath).toBe(oldRoot);
  });
  it.each(["/external/private", `${source}/companies/other/agents/agent-1/instructions`, `${source}/companies/company-1/agents/other/instructions`])("rejects a different source root %s", async root => {
    const agent = makeAgent();
    agent.adapterConfig.instructionsRootPath = root;
    agent.adapterConfig.instructionsFilePath = `${root}/AGENTS.md`;
    await expect(planInstructionRelocation(agent, source)).rejects.toThrow("declared source location");
    expect(agentInstructionsBundleMode(agent)).toBe("external");
  });
  it("rejects missing entries instead of creating them", async () => {
    const agent = makeAgent();
    await fs.unlink(path.join(resolveManagedInstructionsRoot(agent), "AGENTS.md"));
    await expect(planInstructionRelocation(agent, source)).rejects.toThrow("missing");
  });
  it("rejects a symlinked entry", async () => {
    const agent = makeAgent();
    const file = path.join(resolveManagedInstructionsRoot(agent), "AGENTS.md");
    await fs.unlink(file);
    await fs.writeFile(path.join(home, "outside.md"), "outside");
    await fs.symlink(path.join(home, "outside.md"), file);
    await expect(planInstructionRelocation(agent, source)).rejects.toThrow("without symlinks");
  });
  it("rejects traversal in the entry", async () => {
    const agent = makeAgent(); agent.adapterConfig.instructionsEntryFile = "../AGENTS.md";
    await expect(planInstructionRelocation(agent, source)).rejects.toThrow("without traversal");
  });
  it("rolls back locations without overwriting later model/env changes, and rejects stale locations", async () => {
    const agent = makeAgent(); const repair = await planInstructionRelocation(agent, source);
    const later = {...repair.nextConfig, model: "new-model", env: { TZ: "UTC" }};
    const rolledBack = restoreInstructionLocation(later, repair.before, repair.after);
    expect(rolledBack.instructionsFilePath).toBe(agent.adapterConfig.instructionsFilePath);
    expect(rolledBack.model).toBe("new-model"); expect(rolledBack.env).toEqual({TZ: "UTC"});
    expect(() => restoreInstructionLocation({...later, instructionsFilePath: "/changed"}, repair.before, repair.after)).toThrow("refusing rollback");
  });
});
