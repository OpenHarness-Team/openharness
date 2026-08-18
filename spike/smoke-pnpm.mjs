/**
 * desktopPnpm probe smoke: proves `ctx.desktopPnpm` works end-to-end through
 * Cordis injection. The overlay adds the diagnostic `probe-pnpm` row, which
 * consumes the public services exactly as a third-party row would and runs
 * `pnpm --version` through the managed operation handle.
 * Run: pnpm node spike/smoke-pnpm.mjs
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FORK = `${ROOT}packages/deepseek-harness`
const LIB = `${ROOT}packages/dsh-plugin-desktop/lib`
const TIMEOUT_MS = 180_000

const home = mkdtempSync(join(tmpdir(), 'dsh-pnpm-smoke-'))
mkdirSync(join(home, 'profiles', 'web'), { recursive: true })
writeFileSync(
  join(home, 'profiles', 'web', 'package.json'),
  `${JSON.stringify({ name: 'dsh-profile-web', private: true, dependencies: {}, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } } }, undefined, 2)}\n`,
)
const overlay = join(home, 'desktop-layer.yml')
writeFileSync(
  overlay,
  [
    '- insert:',
    '    - id: desktop-profiles',
    `      name: '${LIB}/host/profiles.js'`,
    '      config:',
    "        name: 'web'",
    `        dir: '${join(home, 'profiles', 'web')}'`,
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
    '    - id: probe-pnpm',
    `      name: '${LIB}/host/probe-pnpm.js'`,
    '      config: {}',
    '',
  ].join('\n'),
)

const child = spawn(
  process.execPath,
  ['--expose-internals', '--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'web', '--patch', overlay, '--port', '0'],
  {
    cwd: FORK,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DSH_HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)

let buffer = ''
const fail = (message) => {
  console.error(`SMOKE_PNPM_FAIL ${message}`)
  console.error('--- captured output (tail) ---')
  console.error(buffer.slice(-5000))
  child.kill('SIGKILL')
  process.exit(1)
}
const timer = globalThis.setTimeout(() => fail('timeout'), TIMEOUT_MS)
timer.unref?.()

child.stdout.on('data', (chunk) => {
  buffer += String(chunk)
  process.stdout.write(String(chunk))
})
child.stderr.on('data', (chunk) => {
  buffer += String(chunk)
  process.stderr.write(String(chunk))
})
child.on('exit', (code) => {
  if (code !== null && code !== 0 && !buffer.includes('SMOKE_PNPM_OK')) {
    fail(`child exited early with code ${String(code)}`)
  }
})

const waitFor = async (pattern, label, ms) => {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const match = buffer.match(pattern)
    if (match !== null) return match
    await delay(300)
  }
  return fail(`timeout waiting for ${label}`)
}

await waitFor(/dsh web: http:\/\/127\.0\.0\.1:\d+/, 'loopback URL', 120_000)
const probeLine = await waitFor(/PROBE_PNPM_DONE exit=(\d+) version=(pnpm@\S+|v?\d+\.\d+\.\d+|\S+)/, 'probe result', 60_000)
const exitCode = probeLine?.[1]
const version = probeLine?.[2]
if (exitCode !== '0') fail(`probe exited non-zero: ${String(exitCode)}`)
console.log(`\nSMOKE_PNPM_OK exit=0 version=${String(version)}`)
child.kill('SIGTERM')
await delay(1500)
child.kill('SIGKILL')
process.exit(0)
