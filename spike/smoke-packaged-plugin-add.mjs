/**
 * Packaged `dsh plugin add` smoke: boots the staged runtime closure and uses
 * the diagnostic `probe-add` row to run `ctx.desktopPnpm.runPlugin()` with a
 * local bundle tarball. Asserts the plugin lands in the profile dependency
 * graph and in `dsh.profile.bundles` after the fork's reconciliation.
 *
 * Faithful Electron run (recommended):
 *   ELECTRON_RUN_AS_NODE=1 <electron> spike/smoke-packaged-plugin-add.mjs
 * Logic-only Node run:
 *   node spike/smoke-packaged-plugin-add.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RUNTIME = join(ROOT, 'runtime', 'desktop');
const LIB = join(RUNTIME, 'node_modules', 'dsh-plugin-desktop', 'lib');
const PNPM_BIN = join(RUNTIME, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
const DSH_BIN = join(RUNTIME, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
const TIMEOUT_MS = 240_000;

for (const [label, path] of [
  ['staged probe-add', join(LIB, 'host', 'probe-add.js')],
  ['staged pnpm', PNPM_BIN],
  ['staged dsh bin', DSH_BIN],
]) {
  if (!existsSync(path)) {
    console.error(`SMOKE_PACKAGED_PLUGIN_ADD_FAIL missing ${label} ${path}`);
    process.exit(1);
  }
}

const electronBinary = process.env.ELECTRON_BIN ?? process.execPath;
const home = mkdtempSync(join(tmpdir(), 'dsh-packaged-add-'));
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

// A minimal third-party bundle: `dsh.plugin add` must install it and the
// fork's reconciliation must append it to `dsh.profile.bundles`.
const fixtureDir = join(home, 'fixture-plugin');
mkdirSync(fixtureDir, { recursive: true });
writeFileSync(
  join(fixtureDir, 'package.json'),
  `${JSON.stringify(
    {
      name: 'openharness-smoke-plugin',
      version: '1.0.0',
      private: true,
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    },
    undefined,
    2,
  )}\n`,
);
writeFileSync(join(fixtureDir, 'cordis.patch.yml'), '- insert: []\n');
const pack = spawnSync('npm', ['pack', '--pack-destination', home], {
  cwd: fixtureDir,
  encoding: 'utf8',
});
if (pack.status !== 0) {
  console.error(`SMOKE_PACKAGED_PLUGIN_ADD_FAIL npm pack failed: ${String(pack.stderr)}`);
  process.exit(1);
}
const tarball = join(home, 'openharness-smoke-plugin-1.0.0.tgz');
if (!existsSync(tarball)) {
  console.error(`SMOKE_PACKAGED_PLUGIN_ADD_FAIL missing packed tarball ${tarball}`);
  process.exit(1);
}

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
    '    - id: probe-add',
    `      name: '${join(LIB, 'host', 'probe-add.js')}'`,
    '      config: {}',
    '',
  ].join('\n'),
);

const child = spawn(
  electronBinary,
  ['--expose-internals', DSH_BIN, '--profile', 'web', '--patch', overlay, '--port', '0'],
  {
    cwd: RUNTIME,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      DSH_HOME: home,
      SMOKE_PLUGIN_TARBALL: tarball,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let buffer = '';
const fail = (message) => {
  console.error(`SMOKE_PACKAGED_PLUGIN_ADD_FAIL ${message}`);
  console.error('--- captured output (tail) ---');
  console.error(buffer.slice(-6000));
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
  if (code !== null && code !== 0 && !buffer.includes('SMOKE_PACKAGED_PLUGIN_ADD_OK')) {
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
const addLine = await waitFor(/PROBE_ADD_DONE exit=(\d+)/, 'probe add result', 150_000);
if (addLine?.[1] !== '0') fail(`probe add exited non-zero: ${String(addLine?.[1])}`);

const profilePath = join(home, 'profiles', 'web', 'package.json');
const manifest = JSON.parse(readFileSync(profilePath, 'utf8'));
const bundles = manifest.dsh?.profile?.bundles ?? [];
if (!bundles.includes('openharness-smoke-plugin')) {
  fail(`profile bundles missing openharness-smoke-plugin: ${JSON.stringify(bundles)}`);
}
if (manifest.dependencies?.['openharness-smoke-plugin'] === undefined) {
  fail(
    `profile dependencies missing openharness-smoke-plugin: ${JSON.stringify(manifest.dependencies)}`,
  );
}
if (
  !existsSync(
    join(home, 'profiles', 'web', 'node_modules', 'openharness-smoke-plugin', 'package.json'),
  )
) {
  fail('installed plugin package.json is missing from profile node_modules');
}

console.log(
  '\nSMOKE_PACKAGED_PLUGIN_ADD_OK exit=0 bundles=openharness-smoke-plugin installed=node_modules',
);
child.kill('SIGTERM');
await delay(1500);
child.kill('SIGKILL');
process.exit(0);
