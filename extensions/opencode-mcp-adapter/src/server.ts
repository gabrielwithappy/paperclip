import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as base from '@paperclipai/adapter-opencode-local/server';
import { models, agentConfigurationDoc } from '@paperclipai/adapter-opencode-local';
import { readAdapterExecutionTarget } from '@paperclipai/adapter-utils/execution-target';
import type { AdapterEnvironmentCheck, AdapterExecutionContext, AdapterExecutionResult, AdapterSessionCodec, ServerAdapterModule } from '@paperclipai/adapter-utils';
import { credentialRedactor, DELIVERY_VERSION, mcpIdentity, object, prepareMcp } from './mcp.js';

const exec = promisify(execFile);
export const SUPPORTED_OPENCODE_VERSION = '1.18.9';
const IDENTITY = 'paperclipMcpIdentity';

function unsupported(ctx: Pick<AdapterExecutionContext, 'executionTarget' | 'executionTransport' | 'config'>): boolean {
  const target = readAdapterExecutionTarget({ executionTarget: ctx.executionTarget,
    legacyRemoteExecution: ctx.executionTransport?.remoteExecution });
  const config = ctx.config;
  return object(ctx.executionTarget).kind === 'remote' || target?.kind === 'remote'
    || !!config.filesystemScope || !!config.networkScope;
}

async function cliVersion(command: unknown, env: Record<string, unknown>): Promise<boolean> {
  const cmd = typeof command === 'string' && command.trim() ? command.trim() : 'opencode';
  const { stdout } = await exec(cmd, ['--version'], { timeout: 5000, maxBuffer: 65536,
    env: Object.fromEntries(Object.entries({ ...process.env, ...env }).filter((v): v is [string, string] => typeof v[1] === 'string')) });
  return stdout.trim() === SUPPORTED_OPENCODE_VERSION;
}

function failure(code: string, message: string): AdapterExecutionResult {
  return { exitCode: 1, signal: null, timedOut: false, errorCode: code, errorMessage: message };
}

export const sessionCodec: AdapterSessionCodec = {
  serialize(raw) {
    const value = base.sessionCodec.serialize(raw);
    const id = object(raw)[IDENTITY];
    return value && typeof id === 'string' && /^[a-f0-9]{64}$/.test(id) ? { ...value, [IDENTITY]: id } : value;
  },
  deserialize(raw) {
    const value = base.sessionCodec.deserialize(raw);
    const id = object(raw)[IDENTITY];
    return value && typeof id === 'string' && /^[a-f0-9]{64}$/.test(id) ? { ...value, [IDENTITY]: id } : value;
  },
  getDisplayId: base.sessionCodec.getDisplayId,
};

/** The base adapter retains process/cancellation/provider/skills/usage behavior. */
export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const servers = ctx.runtimeMcp?.getServers() ?? [];
  // Do not lose removed MCP state when a later run has no servers.
  const identity = mcpIdentity(servers);
  const oldIdentity = object(ctx.runtime.sessionParams)[IDENTITY];
  const refresh = ctx.context.refreshTools === true || oldIdentity !== identity;
  const hasSession = Boolean(ctx.runtime.sessionId || object(ctx.runtime.sessionParams).sessionId);
  const runtime = hasSession && refresh
    ? { ...ctx.runtime, sessionId: null, sessionParams: null, sessionDisplayId: null } : ctx.runtime;
  if (!servers.length) {
    const result = await base.execute({ ...ctx, runtime });
    return result.sessionParams ? { ...result, sessionParams: { ...result.sessionParams, [IDENTITY]: identity } } : result;
  }
  if (unsupported(ctx)) return failure('opencode_mcp_target_unsupported', 'This MCP adapter supports local execution without explicit sandbox scopes only.');
  const env = object(ctx.config.env);
  try {
    if (!await cliVersion(ctx.config.command, env)) return failure('opencode_mcp_version_unsupported', `MCP delivery requires tested OpenCode ${SUPPORTED_OPENCODE_VERSION}.`);
  } catch { return failure('opencode_mcp_version_probe_failed', 'Cannot verify the local OpenCode version.'); }
  const redactor = credentialRedactor(servers.map(s => s.token));
  let prepared: Awaited<ReturnType<typeof prepareMcp>> | undefined;
  try {
    prepared = await prepareMcp(servers, env);
    const result = await base.execute({ ...ctx, runtime,
      config: { ...ctx.config, env: { ...env, OPENCODE_CONFIG_CONTENT: prepared.inline } },
      onLog: async (stream, chunk) => { const safe = redactor.push(stream, chunk); if (safe) await ctx.onLog(stream, safe); },
      ...(ctx.onMeta ? { onMeta: async meta => ctx.onMeta!(redactor.value(meta) as typeof meta) } : {}),
    });
    const safe = redactor.value(result) as AdapterExecutionResult;
    return safe.sessionParams ? { ...safe, sessionParams: { ...safe.sessionParams, [IDENTITY]: identity } } : safe;
  } catch (error) {
    // Never rethrow a child error with an unredacted cause/stack or config contents.
    return failure('opencode_mcp_delivery_failed', redactor.redact(error instanceof Error ? error.message : 'MCP delivery failed.'));
  } finally {
    try {
      for (const stream of ['stdout', 'stderr'] as const) {
        const remaining = redactor.push(stream, '', true);
        if (remaining) await ctx.onLog(stream, remaining);
      }
    } finally { await prepared?.cleanup(); }
  }
}

export function createServerAdapter(): ServerAdapterModule {
  return {
    type: 'opencode_local', runtimeToolDelivery: 'native_mcp', execute, sessionCodec,
    // Conservative: explicit tool-refresh wakes start a new session with the normal handoff.
    supportsToolRefreshOnResume: false,
    listSkills: base.listOpenCodeSkills, syncSkills: base.syncOpenCodeSkills,
    listModels: base.listOpenCodeModels, models,
    supportsLocalAgentJwt: true, supportsInstructionsBundle: true,
    instructionsPathKey: 'instructionsFilePath', requiresMaterializedRuntimeSkills: true,
    getRuntimeCommandSpec: config => {
      const command = typeof config.command === 'string' && config.command.trim() ? config.command.trim() : 'opencode';
      // Remote provisioning is intentionally unavailable for this local-only extension.
      return { command, detectCommand: command, installCommand: null };
    },
    agentConfigurationDoc: agentConfigurationDoc + '\nPaperclip MCP extension ' + DELIVERY_VERSION + ': local execution, OpenCode ' + SUPPORTED_OPENCODE_VERSION + '. Remote execution with MCP is unsupported.',
    async testEnvironment(ctx) {
      const checks: AdapterEnvironmentCheck[] = [{ code: 'opencode_mcp_bridge_build', level: 'info',
        message: `Paperclip OpenCode MCP extension ${DELIVERY_VERSION}` }];
      if (unsupported({ ...ctx, executionTransport: undefined })) {
        return { adapterType: 'opencode_local', status: 'fail', testedAt: new Date().toISOString(),
          checks: [...checks, { code: 'opencode_mcp_target_unsupported', level: 'error',
            message: 'MCP delivery supports local execution without explicit sandbox scopes only.' }] };
      }
      let compatible = false;
      try { compatible = await cliVersion(ctx.config.command, object(ctx.config.env)); } catch { /* diagnostic below */ }
      checks.push({ code: 'opencode_mcp_cli_compatibility', level: compatible ? 'info' : 'error',
        message: `MCP delivery requires tested local OpenCode ${SUPPORTED_OPENCODE_VERSION}.` });
      if (!compatible) return { adapterType: 'opencode_local', status: 'fail', checks, testedAt: new Date().toISOString() };
      const result = await base.testEnvironment(ctx);
      return { ...result, checks: [...checks, ...result.checks] };
    },
  };
}
