/**
 * Bridge smoke: full Host↔launcher control-channel loop WITHOUT Electron.
 * A mock control server stands in for apps/desktop; the generation boots
 * with the desktop layer incl. desktop-bridge, then the smoke commits a
 * `dsh-desktop.mode: advanced` settings change and asserts the restart
 * request arrives through desktop-shell → ctx.desktopRuntime → bridge POST.
 * Run: pnpm node spike/smoke-bridge.mjs
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FORK = `${ROOT}packages/deepseek-harness`
const LIB = `${ROOT}packages/dsh-plugin-desktop/lib`
const TIMEOUT_MS = 180_000

// --- mock control server -------------------------------------------------
const received = { register: false, restart: undefined }
const token = 'smoke-token'
const control = createServer((req, res) => {
  if (req.headers['x-dsh-desktop-token'] !== token) {
    res.writeHead(401)
    return res.end('{}')
  }
  let body = ''
  req.on('data', (chunk) => (body += String(chunk)))
  req.on('end', () => {
    if (req.url === '/bridge/register') received.register = true
    if (req.url === '/bridge/restart') received.restart = JSON.parse(body || '{}').reason
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"ok":true}')
  })
})
await new Promise((resolveListen) => control.listen(0, '127.0.0.1', resolveListen))
const controlUrl = `http://127.0.0.1:${String(control.address().port)}`

// --- temp DSH home + overlay ---------------------------------------------
const home = mkdtempSync(join(tmpdir(), 'dsh-bridge-smoke-'))
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
    '    - id: desktop-bridge',
    `      name: '${LIB}/host/bridge.js'`,
    '      config:',
    `        controlUrl: '${controlUrl}'`,
    `        token: '${token}'`,
    '',
  ].join('\n'),
)

// --- spawn generation ------------------------------------------------------
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
  console.error(`SMOKE_BRIDGE_FAIL ${message}`)
  console.error('--- captured output (tail) ---')
  console.error(buffer.slice(-5000))
  child.kill('SIGKILL')
  control.close()
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
  if (code !== null && code !== 0) fail(`child exited early with code ${String(code)}`)
})

// --- assert sequence -------------------------------------------------------
const waitFor = async (predicate, label, ms) => {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (predicate()) return
    await delay(300)
  }
  fail(`timeout waiting for ${label}`)
}

await waitFor(() => buffer.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+)/) !== null, 'loopback URL', 120_000)
await waitFor(() => received.register, 'bridge register', 15_000)
console.log('STEP bridge registered; committing settings mode change (advanced)')
writeFileSync(join(home, 'settings.yaml'), 'dsh-desktop:\n  mode: advanced\n')
await waitFor(() => received.restart !== undefined, 'restart request', 30_000)
console.log(`\nSMOKE_BRIDGE_OK register=true restart=${JSON.stringify(received.restart)}`)
child.kill('SIGTERM')
await delay(1500)
child.kill('SIGKILL')
control.close()
process.exit(0)
