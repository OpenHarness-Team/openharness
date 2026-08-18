#!/usr/bin/env node
/**
 * Packaged runtime gate: verifies the staged runtime closure carries the
 * PHYSICAL entries the packaged Host child needs (ASAR-safe: everything here
 * must survive electron-builder's extraResources copy; nothing may rely on
 * virtual asar paths). Run after scripts/stage-runtime.mjs.
 *
 * Usage: node scripts/runtime-gate.mjs
 */
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(new URL('.', import.meta.url)));
const STAGE = join(ROOT, 'runtime', 'desktop');

const REQUIRED_ENTRIES = [
  // Host entry the packaged child boots (plain built JS, no tsx).
  'node_modules/@deepseek-ai/dsh/lib/bin.js',
  // Bundled pnpm entry the packaged desktopPnpm service runs (directly and
  // through the generated `pnpm` PATH shim used by `dsh plugin`).
  'node_modules/pnpm/bin/pnpm.cjs',
  // Bundle layers the desktop profile composes.
  'node_modules/@deepseek-ai/dsh-base/cordis.patch.yml',
  'node_modules/@deepseek-ai/dsh-web-app/cordis.patch.yml',
  // Desktop layer rows referenced by the launcher-composed overlay.
  'node_modules/dsh-plugin-desktop/lib/host/profiles.js',
  'node_modules/dsh-plugin-desktop/lib/host/pnpm.js',
  'node_modules/dsh-plugin-desktop/lib/host/shell.js',
  'node_modules/dsh-plugin-desktop/lib/host/bridge.js',
  'node_modules/dsh-plugin-desktop/cordis.patch.yml',
];

let failures = 0;
for (const entry of REQUIRED_ENTRIES) {
  const absolute = join(STAGE, entry);
  const resolved = existsSync(absolute) ? realpathSync(absolute) : undefined;
  if (resolved === undefined) {
    console.error(`MISSING ${entry}`);
    failures += 1;
  } else {
    console.log(`OK      ${entry}`);
  }
}

// Native module inventory: the web-profile closure must not gain native
// addons silently (landlock-run is Linux-only; any new addon needs an ABI
// rebuild decision before packaging).
const pnpmModules = join(STAGE, 'node_modules', '.pnpm');
if (existsSync(pnpmModules)) {
  const natives = readdirSync(pnpmModules).filter(
    (name) => name.includes('node-pty') || name.includes('node-addon-landlock'),
  );
  for (const native of natives) {
    console.warn(`NATIVE  ${native} — requires Electron ABI rebuild review before packaging`);
  }
  const packages = readdirSync(pnpmModules).length;
  const size = dirSize(STAGE);
  console.log(
    `CLOSURE ${String(packages)} packages, ${(size / 1024 / 1024).toFixed(1)} MiB staged`,
  );
}

if (failures > 0) {
  console.error(
    `runtime-gate: ${String(failures)} required entr${failures === 1 ? 'y' : 'ies'} missing`,
  );
  process.exit(1);
}
console.log('runtime-gate: PASS');

/** Recursive on-disk size in bytes (follows nothing; symlinks counted once). */
function dirSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) total += dirSize(absolute);
    else if (entry.isFile()) total += statSync(absolute).size;
  }
  return total;
}
