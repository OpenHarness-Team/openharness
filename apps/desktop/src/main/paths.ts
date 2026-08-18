/**
 * Filesystem anchors for the desktop launcher. Dev resolution walks up from
 * the built main bundle to the repository root; packaged resolution anchors
 * on `process.resourcesPath/runtime` — the staged fork runtime closure that
 * electron-builder ships as extraResources (scripts/stage-runtime.mjs builds
 * it). Either mode yields the same four anchors: host runtime directory,
 * plugin lib directory, host entry argv style, and the DSH home.
 * @module apps/desktop/main/paths
 */

import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
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

/** Executable selection and child environment for the desktopPnpm Host row. */
export interface DesktopPnpmComposition {
  pnpmCommand: string[];
  dshCommand: string[];
  pathPrepend: string[];
  extraEnv: Record<string, string>;
}

/**
 * Compose desktopPnpm bootstrap facts. Dev keeps the ambient `pnpm` and leaves
 * `dshCommand` empty (runPlugin fails loud until a source-mode CLI is wired).
 * Packaged mode anchors both executables on the staged runtime closure and
 * generates `pnpm`/`node` PATH shims over the Electron binary, because the
 * fork's `dsh plugin` forwarder shells out to bare `pnpm` and must not depend
 * on a user-installed package manager or system Node.
 */
export function composeDesktopPnpm(userData: string): DesktopPnpmComposition {
  const extraEnv: Record<string, string> = { DSH_HOME: dshHome() };
  if (!isPackagedRuntime()) {
    return { pnpmCommand: ['pnpm'], dshCommand: [], pathPrepend: [], extraEnv };
  }

  const runtime = runtimeDir();
  const pnpmBin = join(runtime, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
  const dshBin = join(runtime, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  const shimDir = join(userData, 'pnpm-shim');
  mkdirSync(shimDir, { recursive: true });

  const electronBinary = process.execPath;
  const nodeShim = join(shimDir, 'node');
  const pnpmShim = join(shimDir, 'pnpm');
  writeFileSync(nodeShim, `#!/bin/sh\nexec "${electronBinary}" "$@"\n`);
  writeFileSync(pnpmShim, `#!/bin/sh\nexec "${electronBinary}" "${pnpmBin}" "$@"\n`);
  chmodSync(nodeShim, 0o755);
  chmodSync(pnpmShim, 0o755);

  return {
    pnpmCommand: [electronBinary, pnpmBin],
    dshCommand: [electronBinary, '--expose-internals', dshBin],
    pathPrepend: [shimDir],
    extraEnv,
  };
}
