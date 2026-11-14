import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parse, type ParseError } from 'jsonc-parser';
import type { AdapterRuntimeMcpServer } from '@paperclipai/adapter-utils';

export const DELIVERY_VERSION = '0.1.0';
export const SERVER_PREFIX = 'paperclip_run_';
export type ObjectValue = Record<string, unknown>;
export const object = (value: unknown): ObjectValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {};

function jsonObject(text: string): ObjectValue {
  const errors: ParseError[] = [];
  const value: unknown = parse(text, errors, { allowTrailingComma: true });
  if (errors.length || !value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid OpenCode configuration; refusing to replace it.');
  }
  return value as ObjectValue;
}

export function serverKey(connectionId: string): string {
  return SERVER_PREFIX + createHash('sha256').update(connectionId).digest('hex').slice(0, 24);
}

function validateServers(servers: AdapterRuntimeMcpServer[]): void {
  const ids = new Set<string>();
  for (const server of servers) {
    if (!server.connectionId || ids.has(server.connectionId)) throw new Error('Duplicate or missing MCP connection identity.');
    ids.add(server.connectionId);
    let url: URL;
    try { url = new URL(server.url); } catch { throw new Error('Invalid Paperclip MCP URL.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
      throw new Error('Unsupported Paperclip MCP URL.');
    }
    if (typeof server.token !== 'string' || !server.token || server.token.length > 16384 || /[\r\n]/.test(server.token)) {
      throw new Error('Invalid Paperclip MCP credential.');
    }
  }
}

/** Secret- and path-independent identity; server-side policy still applies to every call. */
export function mcpIdentity(servers: AdapterRuntimeMcpServer[]): string {
  return createHash('sha256').update(JSON.stringify([DELIVERY_VERSION, ...servers
    .map(s => [s.connectionId, s.url]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))])).digest('hex');
}

async function configurationSources(env: ObjectValue): Promise<ObjectValue[]> {
  const effective = { ...process.env, ...env };
  const home = typeof effective.XDG_CONFIG_HOME === 'string' && effective.XDG_CONFIG_HOME
    ? effective.XDG_CONFIG_HOME : path.join(os.homedir(), '.config');
  const files = ['config.json', 'opencode.json', 'opencode.jsonc'].map(f => path.join(home, 'opencode', f));
  if (typeof effective.OPENCODE_CONFIG === 'string' && effective.OPENCODE_CONFIG) files.push(effective.OPENCODE_CONFIG);
  if (typeof effective.OPENCODE_CONFIG_DIR === 'string' && effective.OPENCODE_CONFIG_DIR) {
    files.push(...['opencode.json', 'opencode.jsonc'].map(f => path.join(effective.OPENCODE_CONFIG_DIR as string, f)));
  }
  const sources: ObjectValue[] = [];
  for (const file of new Set(files)) {
    try { sources.push(jsonObject(await fs.readFile(file, 'utf8'))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Cannot safely read existing OpenCode configuration.');
    }
  }
  return sources;
}

/** Only file references enter transient adapter config. Raw credentials live in private sidecars. */
export async function prepareMcp(servers: AdapterRuntimeMcpServer[], env: ObjectValue) {
  validateServers(servers);
  const inline = env.OPENCODE_CONFIG_CONTENT ?? process.env.OPENCODE_CONFIG_CONTENT;
  if (inline !== undefined && typeof inline !== 'string') throw new Error('OpenCode inline configuration must be text.');
  const original = inline ? jsonObject(inline) : {};
  const keys = new Set(servers.map(s => serverKey(s.connectionId)));
  for (const source of [...await configurationSources(env), original]) {
    if (source.mcp !== undefined && (typeof source.mcp !== 'object' || source.mcp === null || Array.isArray(source.mcp))) {
      throw new Error('Invalid existing OpenCode MCP configuration.');
    }
    if (Object.keys(object(source.mcp)).some(k => keys.has(k) || k.startsWith(SERVER_PREFIX))) {
      throw new Error('Existing MCP configuration conflicts with the reserved Paperclip namespace.');
    }
  }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'paperclip-opencode-mcp-'));
  try {
    await fs.chmod(directory, 0o700);
    const mcp = { ...object(original.mcp) };
    for (const server of servers) {
      const key = serverKey(server.connectionId);
      const file = path.join(directory, key);
      await fs.writeFile(file, 'Bearer ' + server.token, { mode: 0o600, flag: 'wx' });
      mcp[key] = { type: 'remote', url: server.url, oauth: false, enabled: true,
        headers: { Authorization: `{file:${file}}` } };
    }
    return { directory, identity: mcpIdentity(servers),
      inline: JSON.stringify({ ...original, mcp }),
      cleanup: () => fs.rm(directory, { recursive: true, force: true }) };
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true });
    throw error;
  }
}

/** Hold partial secrets across stream chunks; never emit their prefixes before a later chunk arrives. */
export function credentialRedactor(tokens: string[]) {
  const secrets = [...new Set(tokens.filter(Boolean))].sort((a, b) => b.length - a.length);
  const window = Math.max(1, ...secrets.map(s => s.length));
  const pending = new Map<string, string>();
  const redact = (s: string) => secrets.reduce((text, token) => text.split(token).join('[REDACTED]'), s);
  const push = (stream: string, chunk: string, flush = false) => {
    const text = (pending.get(stream) ?? '') + chunk;
    let cut = flush ? text.length : Math.max(0, text.length - window + 1);
    for (const secret of secrets) {
      let pos = text.indexOf(secret);
      while (pos !== -1) {
        if (pos < cut && pos + secret.length > cut) cut = pos;
        pos = text.indexOf(secret, pos + 1);
      }
    }
    pending.set(stream, text.slice(cut));
    return redact(text.slice(0, cut));
  };
  const value = (input: unknown): unknown => {
    if (typeof input === 'string') return redact(input);
    if (Array.isArray(input)) return input.map(value);
    if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, value(v)]));
    return input;
  };
  return { push, redact, value };
}
