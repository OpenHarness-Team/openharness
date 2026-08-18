/**
 * Filesystem anchors for the desktop launcher. Dev resolution walks up from
 * the built main bundle to the repository root; packaged resolution anchors
 * on `process.resourcesPath/runtime` — the staged fork runtime closure that
 * electron-builder ships as extraResources (scripts/stage-runtime.mjs builds
 * it). Either mode yields the same four anchors: host runtime directory,
 * plugin lib directory, host entry argv style, and the DSH home.
 * @module apps/desktop/main/paths
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';

/** Whether this process is a packaged application (asar runtime). */
export function isPackagedRuntime(): boolean {
  return app.isPackaged;
}

/** Repository root; `OPENHARNESS_ROOT` overrides discovery. Dev only. */
export function repoRoot(): string {
  const override = process.env.OPENHARNESS_ROOT;
  if (override !== undefined && override.length > 0) return resolve(override);
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 10; depth += 1) {
    if (
      existsSync(join(dir, 'pnpm-workspace.yaml')) &&
      existsSync(join(dir, 'packages', 'deepseek-harness'))
    ) {
      return dir;
    }
    dir = dirname(dir);
  }
  throw new Error('openharness: repository root not found; set OPENHARNESS_ROOT');
}

/**
 * Host runtime directory: the fork workspace in dev; the staged runtime
 * closure (published DSH family + dsh-plugin-desktop) when packaged. The
 * Host child runs with this directory as cwd so bare module resolution stays
 * inside one installation.
 */
export function runtimeDir(): string {
  if (isPackagedRuntime()) return join(process.resourcesPath, 'runtime');
  return join(repoRoot(), 'packages', 'deepseek-harness');
}

/** Built dsh-plugin-desktop artifacts referenced by desktop-layer overlays. */
export function pluginLibDir(): string {
  if (isPackagedRuntime()) {
    return join(process.resourcesPath, 'runtime', 'node_modules', 'dsh-plugin-desktop', 'lib');
  }
  return join(repoRoot(), 'packages', 'dsh-plugin-desktop', 'lib');
}

/** DSH home: `$DSH_HOME`, else `~/.dsh` (mirrors the fork's resolveDshHome). */
export function dshHome(): string {
  const override = process.env.DSH_HOME;
  if (override !== undefined && override.length > 0) return resolve(override);
  return join(app.getPath('home'), '.dsh');
}
