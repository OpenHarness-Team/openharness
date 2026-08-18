/**
 * Packaged desktopPnpm smoke: boots the staged runtime closure (published DSH
 * family + pnpm + dsh-plugin-desktop) in the packaged-child shape and drives
 * `ctx.desktopPnpm.runPlugin()` through the diagnostic `probe-plugin` row.
 *
 * Faithful Electron run (recommended):
 *   ELECTRON_RUN_AS_NODE=1 <electron> spike/smoke-packaged-pnpm.mjs
 * Logic-only Node run (still validates argv/env composition):
 *   node spike/smoke-packaged-pnpm.mjs
 */
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RUNTIME = join(ROOT, 'runtime', 'desktop');
const LIB = join(RUNTIME, 'node_modules', 'dsh-plugin-desktop', 'lib');
const PNPM_BIN = join(RUNTIME, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
const DSH_BIN = join(RUNTIME, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
const TIMEOUT_MS = 180_000;

for (const [label, path] of [
  ['staged plugin lib', join(LIB, 'host', 'probe-plugin.js')],
  ['staged pnpm', PNPM_BIN],
  ['staged dsh bin', DSH_BIN],
]) {
  if (!existsSync(path)) {
    console.error(
      `SMOKE_PACKAGED_PNPM_FAIL missing ${label} ${path}; run node scripts/stage-runtime.mjs`,
    );
    process.exit(1);
  }
}

const electronBinary = process.env.ELECTRON_BIN ?? process.execPath;
const home = mkdtempSync(join(tmpdir(), 'dsh-packaged-pnpm-'));
mkdirSync(join(home, 'profiles', 'web'), { recursive: true });
writeFileSync(
  join(home, 'profiles', 'web', 'package.json'),
  `${JSON.stringify(
    {
      name: 'dsh-profile-web',
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
    },
    undefined,
    2,
  )}\n`,
);

const shimDir = join(home, 'pnpm-shim');
mkdirSync(shimDir, { recursive: true });
const nodeShim = join(shimDir, 'node');
const pnpmShim = join(shimDir, 'pnpm');
writeFileSync(nodeShim, `#!/bin/sh\nexec "${electronBinary}" "$@"\n`);
writeFileSync(pnpmShim, `#!/bin/sh\nexec "${electronBinary}" "${PNPM_BIN}" "$@"\n`);
chmodSync(nodeShim, 0o755);
chmodSync(pnpmShim, 0o755);

const overlay = join(home, 'desktop-layer.yml');
writeFileSync(
  overlay,
  [
    '- insert:',
    '    - id: desktop-profiles',
    `      name: '${join(LIB, 'host', 'profiles.js')}'`,
    '      config:',
    "        name: 'web'",
    `        dir: '${join(home, 'profiles', 'web')}'`,
    '    - id: desktop-pnpm',
    `      name: '${join(LIB, 'host', 'pnpm.js')}'`,
    '      config:',
    '        pnpmCommand:',
    `          - '${electronBinary}'`,
    `          - '${PNPM_BIN}'`,
    '        dshCommand:',
    `          - '${electronBinary}'`,
    "          - '--expose-internals'",
    `          - '${DSH_BIN}'`,
    '        pathPrepend:',
    `          - '${shimDir}'`,
    '        extraEnv:',
    `          DSH_HOME: '${home}'`,
    '    - id: desktop-shell',
    `      name: '${join(LIB, 'host', 'shell.js')}'`,
    '      config:',
    "        mode: 'compatibility'",
    '    - id: probe-plugin',
    `      name: '${join(LIB, 'host', 'probe-plugin.js')}'`,
    '      config: {}',
    '',
  ].join('\n'),
);

const child = spawn(
  electronBinary,
  ['--expose-internals', DSH_BIN, '--profile', 'web', '--patch', overlay, '--port', '0'],
  {
    cwd: RUNTIME,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DSH_HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let buffer = '';
const fail = (message) => {
  console.error(`SMOKE_PACKAGED_PNPM_FAIL ${message}`);
  console.error('--- captured output (tail) ---');
  console.error(buffer.slice(-5000));
  child.kill('SIGKILL');
  process.exit(1);
};
const timer = globalThis.setTimeout(() => fail('timeout'), TIMEOUT_MS);
timer.unref?.();

child.stdout.on('data', (chunk) => {
  buffer += String(chunk);
  process.stdout.write(String(chunk));
});
child.stderr.on('data', (chunk) => {
  buffer += String(chunk);
  process.stderr.write(String(chunk));
});
child.on('exit', (code) => {
  if (code !== null && code !== 0 && !buffer.includes('SMOKE_PACKAGED_PNPM_OK')) {
    fail(`child exited early with code ${String(code)}`);
  }
});

const waitFor = async (pattern, label, ms) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const match = buffer.match(pattern);
    if (match !== null) return match;
    await delay(300);
  }
  return fail(`timeout waiting for ${label}`);
};

await waitFor(/dsh web: http:\/\/127\.0\.0\.1:\d+/, 'loopback URL', 120_000);
const probeLine = await waitFor(
  /PROBE_PLUGIN_DONE exit=(\d+) version=(pnpm@\S+|v?\d+\.\d+\.\d+|\S+)/,
  'runPlugin probe result',
  90_000,
);
if (probeLine?.[1] !== '0') fail(`runPlugin probe exited non-zero: ${String(probeLine?.[1])}`);
console.log(`\nSMOKE_PACKAGED_PNPM_OK exit=0 version=${String(probeLine?.[2])}`);
child.kill('SIGTERM');
await delay(1500);
child.kill('SIGKILL');
process.exit(0);
