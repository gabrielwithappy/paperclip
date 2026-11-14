# Single-checkout local service

This runs the current `devel` tree through the existing CLI systemd user manager.
PostgreSQL stays in the `paperclip-private-slack_pgdata` Docker volume. The
authoritative migration and acceptance record is
[the migration plan](../../doc/plans/2026-11-13-devel-local-service-migration.md).

## Configuration

Keep actual files outside Git. Create `~/.config/paperclip/local-service/` with
mode 0700, put an absolute, supported Node executable path followed by a newline
in `node-path`, and create mode 0600 `runtime.env` using `runtime.env.example`.
The example contains placeholders and cannot operate the existing instance.
The launcher loads dotenv with Node; it never evaluates the file as shell code.
It uses the source CLI, the same HOME/instance/config for all service commands,
static UI, and `run --no-repair`. It refuses a missing config or mismatched DB/port.

Keep the systemd user's HOME unchanged. Set `PAPERCLIP_HOME` to the migrated data
directory; map container instructions, workspaces, skill sources, and CLI
authentication paths explicitly. Preserve master/session/tool signing keys.
When the old server used the Better Auth secret as its agent JWT fallback, set
the explicit JWT variable to that same value rather than generating a new key.
Use a Docker-reachable API URL for container agents. Host localhost and container
localhost are different endpoints.

## Cutover

1. Preserve Git changes, refs, the running image, Compose/env and routing settings.
   Do not clean or automatically commit other work in the checkout.
2. Use the authenticated `/api/instance/task-drain` API to prevent new execution,
   block webhook ingress and user writes, and wait for active runs to finish.
   Record the original routine/company settings before pausing automation.
   Stop the Docker server and callback; disable their restart policies and any
   external redeployment. Do not stop unrelated containers.
3. Run `scripts/local-service/backup /absolute/new-recovery-directory` with every
   writer stopped. It records DB/HOME, local runtime configuration, dirty Git
   changes and container metadata. The archive check is not a restore rehearsal.
   Copy the archived HOME into the dedicated host directory, retaining the
   original volume. Set ownership/permissions for the service user.
4. Apply the base Compose plus `docker/docker-compose.local-service.yml` with the
   original project name and env file, using `up -d --no-deps db`. Confirm the
   exact pgdata volume identity and `pg_isready`. Only 127.0.0.1:55432 is published.
5. Run `scripts/local-service/prepare /absolute/verified-recovery-directory`.
   This performs frozen install, full typecheck/tests/build, UI synchronization,
   callback tests, and CLI service tests. Run only with the app stopped. Failure
   leaves the service stopped. Review pending migrations and apply once after
   backup; do not assume the old image can read the resulting schema.
6. Run `scripts/local-service/launcher doctor` without `--repair`; inspect every
   warning/failure. `manage install` registers/enables the CLI unit without
   starting it. Linger must already be enabled or be explicitly enabled through
   the CLI. `manage start` starts the source service. `manage status --json`,
   `manage logs`, `manage stop`, and `manage restart` reuse the same environment.
7. Render `slack-callback.service.in` into
   `~/.config/systemd/user/paperclip-slack-callback.service`, replacing
   `@LAUNCHER@` with the absolute launcher path (systemd-escape any `$`/`%`).
   Run `systemctl --user daemon-reload`, then enable/start that unit only after
   the Docker callback releases 3111. It admits only POST Slack endpoint paths,
   forwards original body/signature bytes to 127.0.0.1:3110, and rejects other
   routes with 404. The existing Tunnel continues targeting 127.0.0.1:3111.
8. Verify MainPID/cwd/source command, one port owner, health, existing login/data,
   attachments, secret decryption, skill files and one representative agent run.
   Validate signed Slack delivery, duplicate handling and invalid signatures
   before resuming saved automation settings and external ingress.

Default paths assume the default instance. For another existing instance, adjust
the callback unit's `After=` and retain its actual ID. For a non-default config
directory, persist `PAPERCLIP_LOCAL_CONFIG_DIR` in both units' drop-ins; a shell
environment alone is not inherited by systemd.

## Updates and recovery

Fetch upstream refs while running; record the actual default branch and target
SHA. Before editing this checkout, merging, installing or building: drain, block
ingress, stop app/callback, and make a fresh recovery set.
For updates, pass the current absolute host `PAPERCLIP_HOME` as the backup helper's
second argument; omitting it selects the preserved Docker volume for first cutover.
Merge the explicit upstream target into the existing devel branch and preserve its tracking. Resolve
conflicts individually and restore any saved local work before validation.
Repeat prepare, migration review, startup and acceptance. Never schedule merges
or restarts, and never start `pnpm dev` while the service owns this instance.

Recover the first cutover with its pinned Docker image/config and matching
DB/HOME set. Recover later updates with that update's previous working devel
code, dirty changes, lockfile, pinned Node/pnpm and matching DB/HOME set. Restore
changed or uncertain data formats into a new recovery target, preserving failed
state and subsequent writes; do not connect older code to an incompatible DB.
No automatic restore, hard reset, volume deletion, or guessed reverse migration
is implemented by these helpers.

## Repair migrated agent instructions

A container's stored absolute instructions paths may still point at its old HOME.
Even a stored `managed` mode is treated as external when its root differs from
this instance's canonical managed root. Ordinary harness edits can then return
403. Do not weaken the external-files instance-admin check or grant users extra
roles to work around the migration.

Use `repair-instructions` with the pinned local service configuration. It changes
only the four instructions location fields, using the agent configuration
transaction for revisions and notifications. It never changes the harness,
model, environment values, connection credentials, lifecycle status or files.

First inspect a dry-run (repeat `--agent-id` to select more agents):

```sh
scripts/local-service/repair-instructions \
  --from-instance-root /paperclip/instances/default \
  --company-id COMPANY_UUID --agent-id AGENT_UUID
```

Apply only after stopping the app, callback and other writers, confirming no
running/queued runs, and taking a verified DB/HOME backup as above. Add
`--apply --backup-file /absolute/private-0700-directory/new-repair.json` to the
same command. The snapshot is created exclusively with mode 0600 and contains
private configuration; do not upload or commit it. Each chosen old location must
match that company/agent's canonical source location exactly, and the migrated
entry must already exist without symlinks. A canonical instruction revision, if
present, must match the file hash. All selected updates commit together; stale
rows/files or any validation failure abort them. A snapshot may exist even when
its transaction rolled back; it is not a success receipt. The default dry-run is
read-only; re-running a successful repair reports `changed: false`.

For a conditional rollback, repeat the same scope/source options and add
`--rollback-file /absolute/private-directory/repair.json`. Inspect the default
dry-run first; add `--apply --backup-file /absolute/private-directory/new-rollback.json`
while all writers are stopped. This restores only the original four location
fields, preserving any later model/environment changes, and refuses to overwrite
an intervening location edit. It does not restore old file contents or the full
DB. Restart the services and reload the browser before editing the harness.

Masked environment values in an unsaved cross-harness test are a separate 422:
explicitly re-enter every retained plain value, or save the corrected harness
configuration and reload before testing. Never substitute the mask as a secret
or delete needed Google Workspace variables to silence the guard.
