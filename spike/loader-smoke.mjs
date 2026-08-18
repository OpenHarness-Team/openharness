/**
 * Loader smoke: compose the dsh-plugin-desktop Host rows into the fork's web
 * profile through a --patch overlay (absolute-path specifiers), boot it with
 * the Electron-as-Node child pattern, and verify the loopback carrier. A
 * successful boot proves the rows mounted: dsh fail-loud audit rejects any
 * enabled entry without a fiber. Run: pnpm node spike/loader-smoke.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FORK = `${ROOT}packages/deepseek-harness`;
const LIB = `${ROOT}packages/dsh-plugin-desktop/lib`;
const TIMEOUT_MS = 150_000;

for (const entry of ['host/profiles.js', 'host/pnpm.js', 'host/shell.js']) {
  if (!existsSync(join(LIB, entry))) {
    console.error(
      `LOADER_SMOKE_FAIL missing build artifact lib/${entry}; run: pnpm --filter dsh-plugin-desktop build`,
    );
    process.exit(1);
  }
}

const overlay = join(mkdtempSync(join(tmpdir(), 'dsh-desktop-smoke-')), 'desktop-layer.yml');
writeFileSync(
  overlay,
  [
    '# Smoke overlay: desktop layer with absolute-path specifiers (the launcher',
    '# composes the same rows with bare names once resolution is wired).',
    '- insert:',
    '    - id: desktop-profiles',
    `      name: '${LIB}/host/profiles.js'`,
    '      config:',
    "        name: 'web'",
    `        dir: '${homedir()}/.dsh/profiles/web'`,
    '    - id: desktop-pnpm',
    `      name: '${LIB}/host/pnpm.js'`,
    '      config:',
    '        pnpmCommand:',
    "          - 'pnpm'",
    '        dshCommand: []',
    '    - id: desktop-shell',
    `      name: '${LIB}/host/shell.js'`,
    '      config:',
    "        mode: 'compatibility'",
    '',
  ].join('\n'),
);

const child = spawn(
  process.execPath,
  [
    '--expose-internals',
    '--import',
    'tsx/esm',
    'apps/cli/src/bin.ts',
    '--profile',
    'web',
    '--patch',
    overlay,
    '--port',
    '0',
  ],
  {
    cwd: FORK,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let buffer = '';
const fail = (message) => {
  console.error(`LOADER_SMOKE_FAIL ${message}`);
  console.error('--- captured output (tail) ---');
  console.error(buffer.slice(-5000));
  child.kill('SIGKILL');
  process.exit(1);
};

const timer = globalThis.setTimeout(() => fail('timeout waiting for loopback URL'), TIMEOUT_MS);
timer.unref?.();

child.stdout.on('data', async (chunk) => {
  buffer += String(chunk);
  process.stdout.write(String(chunk));
  const match = buffer.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+)/);
  if (match === null) return;
  const url = match[1];
  try {
    const response = await fetch(url);
    const html = await response.text();
    if (!response.ok) return fail(`HTTP ${String(response.status)} from ${url}`);
    if (!html.toLowerCase().includes('<html')) return fail('response is not an HTML document');
    console.log(
      `\nLOADER_SMOKE_OK url=${url} status=${String(response.status)} rows=desktop-profiles,desktop-pnpm,desktop-shell`,
    );
    child.kill('SIGTERM');
    await delay(1500);
    child.kill('SIGKILL');
    process.exit(0);
  } catch (error) {
    fail(`fetch failed: ${String(error)}`);
  }
});

child.stderr.on('data', (chunk) => {
  buffer += String(chunk);
  process.stderr.write(String(chunk));
});

child.on('exit', (code) => {
  if (code !== null && code !== 0) fail(`child exited early with code ${String(code)}`);
});
