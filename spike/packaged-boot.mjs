/**
 * Packaged-mode boot spike: proves the packaged child invocation shape —
 * built `@deepseek-ai/dsh/lib/bin.js` (no tsx) running inside the staged
 * runtime closure (published rc.7 family), with the desktop layer composed
 * from the STAGED dsh-plugin-desktop artifacts. This is exactly what the
 * packaged launcher does minus the asar shell.
 * Run: pnpm node spike/packaged-boot.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STAGE = join(ROOT, 'runtime', 'desktop');
const BIN = join(STAGE, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
const STAGED_LIB = join(STAGE, 'node_modules', 'dsh-plugin-desktop', 'lib');
const TIMEOUT_MS = 150_000;

for (const required of [BIN, join(STAGED_LIB, 'host', 'bridge.js')]) {
  if (!existsSync(required)) {
    console.error(`PACKAGED_BOOT_FAIL missing ${required}; run node scripts/stage-runtime.mjs`);
    process.exit(1);
  }
}

const overlay = join(mkdtempSync(join(tmpdir(), 'dsh-packaged-boot-')), 'desktop-layer.yml');
writeFileSync(
  overlay,
  [
    '- insert:',
    '    - id: desktop-profiles',
    `      name: '${STAGED_LIB}/host/profiles.js'`,
    '      config:',
    "        name: 'web'",
    `        dir: '${homedir()}/.dsh/profiles/web'`,
    '    - id: desktop-pnpm',
    `      name: '${STAGED_LIB}/host/pnpm.js'`,
    '      config:',
    '        pnpmCommand:',
    "          - 'pnpm'",
    '        dshCommand: []',
    '    - id: desktop-shell',
    `      name: '${STAGED_LIB}/host/shell.js'`,
    '      config:',
    "        mode: 'compatibility'",
    '    - id: desktop-bridge',
    `      name: '${STAGED_LIB}/host/bridge.js'`,
    '      config:',
    "        controlUrl: 'http://127.0.0.1:9'",
    "        token: 'packaged-boot-stub'",
    '',
  ].join('\n'),
);

const child = spawn(
  process.execPath,
  ['--expose-internals', BIN, '--profile', 'web', '--patch', overlay, '--port', '0'],
  {
    cwd: STAGE,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let buffer = '';
const fail = (message) => {
  console.error(`PACKAGED_BOOT_FAIL ${message}`);
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
      `\nPACKAGED_BOOT_OK url=${url} status=${String(response.status)} runtime=staged-closure`,
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
