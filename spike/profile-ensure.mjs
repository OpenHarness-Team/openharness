/**
 * Headless test for the launcher-managed desktop profile logic
 * (apps/desktop/src/main/profile.ts), run through the fork's tsx so the
 * Electron-free module imports directly. Exercises: first-use creation,
 * installation-owned idempotency, user-owned preservation, corrupt-manifest
 * rejection. Run: pnpm node spike/profile-ensure.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FORK = join(ROOT, 'packages', 'deepseek-harness');
const CASES = join(ROOT, 'spike', 'profile-ensure-cases.ts');

const home = mkdtempSync(join(tmpdir(), 'dsh-profile-ensure-'));
const child = spawn(process.execPath, ['--import', 'tsx/esm', CASES, home], {
  cwd: FORK,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 1));
