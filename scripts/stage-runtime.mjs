#!/usr/bin/env node
/**
 * Stage the packaged Host runtime closure into runtime/desktop/.
 *
 * The staged closure installs the PUBLISHED 0.1.0-rc.7 DSH family from the
 * npm registry (identical bytes to the fork baseline while the fork carries
 * zero patches) plus the local dsh-plugin-desktop build — the same
 * consumption shape the reference project uses. Once fork patches diverge
 * from published rc.7, switch the pinned versions to release:pack tarballs
 * (packages/deepseek-harness `pnpm run release:pack --family dsh`) and
 * register the patch in PATCHES.md.
 *
 * Usage: node scripts/stage-runtime.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(new URL('.', import.meta.url)));
const RUNTIME = join(ROOT, 'runtime');
const STAGE = join(RUNTIME, 'desktop');
const RUNTIME_FAMILY = '0.1.0-rc.7';

mkdirSync(STAGE, { recursive: true });

// Isolated workspace marker: without it pnpm walks up to the repo root
// workspace and installs nothing for the staged closure.
writeFileSync(join(RUNTIME, 'pnpm-workspace.yaml'), 'packages:\n  - "desktop"\n');


const manifest = {
  name: 'openharness-desktop-runtime',
  version: '0.0.1',
  private: true,
  type: 'module',
  description:
    'Staged Host runtime closure for the packaged OpenHarness desktop app. Installed from the published DSH family while the fork carries zero patches; switch to release:pack tarballs on first divergent patch.',
  dependencies: {
    '@deepseek-ai/dsh': RUNTIME_FAMILY,
    '@deepseek-ai/dsh-base': RUNTIME_FAMILY,
    '@deepseek-ai/dsh-web-app': RUNTIME_FAMILY,
    'dsh-plugin-desktop': 'file:../../packages/dsh-plugin-desktop',
  },
};
writeFileSync(join(STAGE, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`);

console.log(`stage-runtime: installing closure into ${STAGE}`);
// npm (not pnpm): the packaged closure must be a fully physical tree.
// electron-builder extraResources drops dot-directories (pnpm's .pnpm
// virtual store), which would leave a pnpm-staged closure as dangling
// symlinks inside the app bundle. npm installs real directories.
// --ignore-scripts matches the fork install stance (no postinstall hooks).
execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: STAGE,
  stdio: 'inherit',
});
console.log('stage-runtime: done; verify with node scripts/runtime-gate.mjs');
