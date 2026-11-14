// Development only: resolve this checkout's built public peer exports, not registry copies.
import fs from 'node:fs/promises';
import path from 'node:path';
const host = path.resolve(process.argv[2] ?? '../..');
const own = JSON.parse(await fs.readFile('package.json', 'utf8'));
for (const [name, relative] of [
  ['@paperclipai/adapter-opencode-local', 'packages/adapters/opencode-local'],
  ['@paperclipai/adapter-utils', 'packages/adapter-utils'],
]) {
  const source = path.join(host, relative);
  const pkg = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8'));
  if (own.peerDependencies[name] !== pkg.version) throw new Error(`Incompatible host peer: ${name}`);
  await fs.access(path.join(source, 'dist/index.js'));
  const dest = path.join('node_modules', name);
  const marker = path.join(dest, '.paperclip-host-link');
  try { await fs.access(dest); await fs.access(marker); }
  catch (error) {
    try { await fs.access(dest); throw new Error(`Refusing to replace existing dependency: ${name}`); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  await fs.mkdir(dest, { recursive: true });
  await fs.writeFile(path.join(dest, 'package.json'), JSON.stringify({ ...pkg, exports: pkg.publishConfig.exports }));
  try { await fs.symlink(path.join(source, 'dist'), path.join(dest, 'dist'), 'dir'); }
  catch (e) { if (e.code !== 'EEXIST') throw e; }
  await fs.writeFile(marker, source + '\n');
}
const jsonc = path.join(host, 'node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser');
try { await fs.symlink(jsonc, 'node_modules/jsonc-parser', 'dir'); }
catch (e) { if (e.code !== 'EEXIST') throw e; }
for (const [name, source] of [
  ['@types/node', path.join(host, 'packages/adapters/opencode-local/node_modules/@types/node')],
  ['tsx', path.join(host, 'cli/node_modules/tsx')],
]) {
  const dest = path.join('node_modules', name);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  try { await fs.symlink(source, dest, 'dir'); }
  catch (e) { if (e.code !== 'EEXIST') throw e; }
}
console.log('Linked built host peers and local development tools; no host configuration changed.');
