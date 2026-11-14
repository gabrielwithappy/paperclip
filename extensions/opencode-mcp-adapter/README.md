# Paperclip OpenCode MCP external adapter

Installable external replacement for `opencode_local`. It applies Paperclip's
run-scoped MCP gateways to OpenCode while reusing the built-in adapter's process,
model/provider configuration, skills, instructions, transcript, usage, and session
handling. Paperclip continues to enforce company access, per-tool policy and approvals.
No provider OAuth tokens are extracted and no supplier login is performed here.

## Supported configuration

- Self-hosted Paperclip; base `@paperclipai/adapter-opencode-local` and
  `@paperclipai/adapter-utils` **0.3.1**, tested against checkout `611a8547ea` builds.
- Local **OpenCode 1.18.9**. Other CLI versions fail the MCP preflight until tested.
- Explicit filesystem/network sandbox scopes and remote/SSH/Daytona targets are
  unsupported for MCP delivery. Environment diagnostics reject them before probing.
- The same type overrides **all** `opencode_local` agents in the instance, including
  other companies. Inspect execution targets before enabling the override.
- With no delivered servers the base execution path remains available; previously
  attached MCP sessions are reset when their delivered set changes.

## Build in this source checkout

From this directory:

```sh
node scripts/link-host.mjs ../..
npm run typecheck
npm run build
npm test
npm pack --dry-run
```

`link-host` creates development-only package shims in this directory's ignored
`node_modules`, resolving the host's built public exports and local development
tools. Build the host packages first if their `dist` files are missing. The root
workspace/lockfile and live instance configuration are not modified. Source-checkout
peers contain TypeScript dependencies; the local tests therefore use the host's
`tsx` loader. For an independently installed package use published peers with built
exports of the exact compatible versions, and install its declared dependencies.
`npm pack` includes only `dist`, package metadata and this README.

The `.`, `./server`, `./ui`, `./cli` exports are provided. `./ui-parser` is bundled
without runtime imports. Existing OpenCode config UI/CLI behavior is reused by type.

## What is injected

Each run receives only gateways from `ctx.runtimeMcp.getServers()`. Their stable
`connectionId` produces a deterministic server key under `paperclip_run_`. Actual
credentials are written to a dedicated 0700 temporary directory, in 0600 files.
Transient `OPENCODE_CONFIG_CONTENT` contains file references, not tokens, and sets
`oauth:false` to prevent OpenCode requesting a second OAuth authorization.

User provider/MCP configuration is retained. JSON/JSONC collisions with the
reserved namespace or malformed configuration fail explicitly. Do not put your
own servers under `paperclip_run_`. OpenCode project config stays disabled by the
base adapter. The extension never changes global environment variables, durable
agent settings, server grants, or stored connections.

Credentials are removed after the base invocation finishes (including ordinary
startup failure). Token values are also redacted from stream chunks, invocation
metadata, and returned results. The model must use the Paperclip gateway; a direct
unauthenticated request to `ai.todoist.net/mcp` cannot test saved Paperclip OAuth.

## Session behavior

The codec preserves the base session fields plus a nonsecret hash of MCP identities
and endpoints. Tokens and temporary paths do not enter session state. Compatible
sets keep the session while each process gets fresh token sidecars. Changed or
removed sets start fresh using Paperclip's existing handoff mechanism. Explicit
refresh requests use `supportsToolRefreshOnResume:false` conservatively, allowing
the host to choose a fresh session. Original provider conversation history is not deleted.

## Installation and rollback

This implementation does **not** install itself or modify a running instance.
After reviewing the package and instance-wide impact, an instance administrator
can use the existing adapter install UI/API with this directory's absolute
`localPath`, or install a packed/published package. Use a private fixture instance
first; cloud-managed instances prohibit external adapter code installation.

The current install endpoint is `POST /api/adapters/install`. Its request body
for a local package is:

```json
{
  "packageName": "/absolute/path/to/extensions/opencode-mcp-adapter",
  "isLocalPath": true
}
```

`localPath` is stored in the installation record; it is not the request field.
Use the existing authenticated instance-admin session. Activation uses
`PATCH /api/adapters/opencode_local/override` with `{"paused":false}`.
Keep the source directory, its dependencies and built `dist` files available.
Git preserves the source, but excludes dependencies, build files and the
instance's installation registration. A fresh checkout needs build/dependency
preparation and a separate instance installation.

Installation records and API `source: external` alone do not prove that the external
implementation loaded. Run environment diagnostics and confirm
`opencode_mcp_bridge_build` reports `0.1.0`. Check again after a cold restart and
verify an authenticated fixture call. Loader import failure can leave the built-in
adapter active. A package cannot intercept that host loader fallback.

The existing `/api/adapters/opencode_local/override` endpoint with `paused:true`
selects the built-in fallback for future runs. Removing the external adapter also
restores the built-in. Preserve the plugin installation record and original agent
settings before operations. Active runs retain their selected module. Rollback
keeps provider authentication/grants, but the built-in adapter again lacks this MCP
injection. Use the current instance's existing admin authentication; never embed
its token in commands, the package, or issue comments.

## Verified evidence and remaining limits

- Unit tests cover config preservation, JSONC collision handling, validation,
  private permissions, concurrent isolation, token-independent identities and
  redaction across chunk boundaries.
- The real base executor is exercised with a fake CLI: delivery, cleanup, rotation,
  session preservation and removal. Factory capabilities and codec are checked.
- Actual OpenCode 1.18.9 performs MCP `initialize` and authenticated `tools/list`.
- A local OpenAI-compatible model fixture drives the **actual base executor and
  actual OpenCode CLI** through authenticated `tools/call`, token rotation with
  session resume, and removal with a fresh session. No external model cost or
  Todoist mutations occur.

These are local protocol/adapter tests, not a full Paperclip task acceptance run.
On 2026-11-15 the current self-hosted instance additionally passed authenticated
API installation/activation, override pause/resume, cold-restart persistence,
the external build diagnostic and an actual CLI hello probe through the server.
A server-side Todoist `get-overview` read also succeeded. The installation record
is outside Git; this evidence does not make a fresh checkout installed.
Task-bound approval→approve-and-run→resume exactly-once, company-isolation
end-to-end, uninstall/reinstall recovery, and a full OpenCode agent task using
live Todoist remain separate qualification steps. Existing host enforcement is
reused, not replaced. See the repository's implementation plan for the evidence record.

The sidecar cleanup uses `finally`; **host SIGKILL, machine crash or power loss can
leave 0600 files in the temporary directory**. There is no automatic age-based
sweeper because long-running live processes may still need them. After a crash,
verify the relevant OpenCode process has stopped before securely removing the
orphaned `paperclip-opencode-mcp-*` directory. Do not copy it into backups/artifacts.
Full host-crash recovery and remote support are not claimed by version 0.1.0.
