import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = process.env;
const configPath = env.PAPERCLIP_CONFIG;
if (!configPath || !path.isAbsolute(configPath) || !fs.existsSync(configPath)) {
  throw new Error('Existing absolute PAPERCLIP_CONFIG is required; onboarding is disabled by this launcher.');
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (!env.PAPERCLIP_HOME || !env.PAPERCLIP_INSTANCE_ID || !env.DATABASE_URL) {
  throw new Error('PAPERCLIP_HOME, PAPERCLIP_INSTANCE_ID and DATABASE_URL are required.');
}
if (config.database.mode !== 'postgres' || config.database.connectionString !== env.DATABASE_URL
    || config.server.port !== Number(env.PORT)) {
  throw new Error('Config and environment must identify the same PostgreSQL database and app port.');
}
env.PAPERCLIP_SHIM_PATH = path.join(root, 'scripts/local-service/launcher');
env.PAPERCLIP_UI_DEV_MIDDLEWARE = 'false';
env.SERVE_UI = 'true';
env.PATH = `${path.dirname(process.execPath)}:${env.PATH ?? '/usr/local/bin:/usr/bin:/bin'}`;
process.chdir(root);
let args = process.argv.slice(2);
if (args[0] === 'callback') {
  await import('./slack-callback.mjs');
} else {
  if (args[0] === 'run') {
    for (const artifact of ['server/ui-dist/index.html', 'packages/plugins/sdk/dist/index.js',
      'packages/paperclip-runner/dist/index.js', 'packages/paperclip-runner/dist/bin/paperclip-runnerd']) {
      if (!fs.existsSync(path.join(root, artifact))) throw new Error(`Missing build prerequisite: ${artifact}`);
    }
    // CLI run defaults to repair=yes. Preserve the existing keys and settings.
    args = [...args, '--no-repair'];
  }
  if (args[0] === 'service' && !args.includes('--instance') && !args.includes('-i')) {
    args = [...args, '--instance', env.PAPERCLIP_INSTANCE_ID];
  }
  process.execve(process.execPath, [process.execPath, path.join(root, 'cli/node_modules/tsx/dist/cli.mjs'),
    path.join(root, 'cli/src/index.ts'), ...args], env);
}
