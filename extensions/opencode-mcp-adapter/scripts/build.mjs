import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
await build({ entryPoints: ['src/index.ts', 'src/server.ts', 'src/ui.ts', 'src/cli.ts'],
  outdir: 'dist', platform: 'node', format: 'esm', target: 'node24', bundle: true,
  external: ['@paperclipai/*', 'jsonc-parser'] });
// UI-parser contract forbids runtime imports; inline the existing public parser.
await build({ entryPoints: ['src/ui-parser.ts'], outfile: 'dist/ui-parser.js',
  platform: 'browser', format: 'esm', target: 'es2022', bundle: true });
execFileSync('tsc', [], { stdio: 'inherit' });
