/**
 * Headless test for the dsh-desktop.mode settings plumbing
 * (apps/desktop/src/main/mode.ts), run through the fork's tsx so the
 * Electron-free module imports directly. Exercises: default resolution,
 * section creation, in-place replacement, foreign-content preservation,
 * block-without-mode insertion, and the platform support matrix.
 * Run: pnpm node spike/mode-smoke.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FORK = join(ROOT, 'packages', 'deepseek-harness');
const CASES = join(ROOT, 'spike', 'mode-cases.ts');

const home = mkdtempSync(join(tmpdir(), 'dsh-mode-smoke-'));
const child = spawn(process.execPath, ['--import', 'tsx/esm', CASES, home], {
  cwd: FORK,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 1));
