/**
 * Spike stage 1: boot the fork's web profile with the Electron binary in Node
 * mode (ELECTRON_RUN_AS_NODE=1) and verify the loopback carrier over HTTP.
 * Run: pnpm node spike/boot-test.mjs
 */
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FORK = `${ROOT}packages/deepseek-harness`;
const TIMEOUT_MS = 120_000;

const child = spawn(
  process.execPath,
  [
    '--expose-internals',
    '--import',
    'tsx/esm',
    'apps/cli/src/bin.ts',
    '--profile',
    'web',
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
const urlPattern = /dsh web: (http:\/\/127\.0\.0\.1:\d+)/;

const fail = (message) => {
  console.error(`SPIKE_BOOT_FAIL ${message}`);
  console.error('--- captured output ---');
  console.error(buffer.slice(-4000));
  child.kill('SIGKILL');
  process.exit(1);
};

const timer = globalThis.setTimeout(() => fail('timeout waiting for loopback URL'), TIMEOUT_MS);
timer.unref?.();

child.stdout.on('data', async (chunk) => {
  buffer += String(chunk);
  process.stdout.write(String(chunk));
  const match = buffer.match(urlPattern);
  if (match === null) return;
  const url = match[1];
  try {
    const response = await fetch(url);
    const html = await response.text();
    if (!response.ok) return fail(`HTTP ${String(response.status)} from ${url}`);
    if (!html.toLowerCase().includes('<html')) return fail('response is not an HTML document');
    console.log(
      `\nSPIKE_BOOT_OK url=${url} status=${String(response.status)} bytes=${String(html.length)}`,
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
  if (code !== null && code !== 0 && !buffer.includes('SPIKE_BOOT_OK')) {
    fail(`child exited early with code ${String(code)}`);
  }
});
