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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(new URL('.', import.meta.url)));
const RUNTIME = join(ROOT, 'runtime');
const STAGE = join(RUNTIME, 'desktop');
const PLUGIN = join(ROOT, 'packages', 'dsh-plugin-desktop');
const RUNTIME_FAMILY = '0.1.0-rc.7';
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';

mkdirSync(STAGE, { recursive: true });

// The runtime consumes built JS from the local plugin, so require it before
// staging. This also keeps stage-runtime honest: never stage a half-built plugin.
if (!existsSync(join(PLUGIN, 'lib', 'host', 'bridge.js'))) {
  throw new Error(
    'dsh-plugin-desktop/lib is missing; run `pnpm --filter dsh-plugin-desktop build` first',
  );
}

// Pack the local plugin to a tarball and depend on the tarball. npm installs
// directory-based `file:` dependencies as symlinks, which electron-builder
// extraResources would copy as empty directories inside the app bundle; a
// tarball installs as a real, physical directory in the staged tree.
const pluginManifest = JSON.parse(readFileSync(join(PLUGIN, 'package.json'), 'utf8'));
const pluginTarball = join(RUNTIME, `${pluginManifest.name}-${pluginManifest.version}.tgz`);
execFileSync(NPM_COMMAND, ['pack', '--pack-destination', RUNTIME], {
  cwd: PLUGIN,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

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
    // Bundled package manager for packaged `desktopPnpm.runPlugin()`: the
    // fork's `dsh plugin` forwarder shells out to `pnpm` on PATH, and the
    // packaged app has no ambient pnpm. The launcher generates a `pnpm` shim
    // over this JS entry (see apps/desktop/src/main/paths.ts).
    pnpm: '11.7.0',
    'dsh-plugin-desktop': `file:${pluginTarball}`,
  },
};
writeFileSync(join(STAGE, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`);

console.log(`stage-runtime: installing closure into ${STAGE}`);
// npm (not pnpm): the packaged closure must be a fully physical tree.
// electron-builder extraResources drops dot-directories (pnpm's .pnpm
// virtual store), which would leave a pnpm-staged closure as dangling
// symlinks inside the app bundle. npm installs real directories.
// --ignore-scripts matches the fork install stance (no postinstall hooks).
execFileSync(NPM_COMMAND, ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: STAGE,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
console.log('stage-runtime: done; verify with node scripts/runtime-gate.mjs');
