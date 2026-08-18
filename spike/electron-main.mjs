/**
 * Spike stage 2: real Electron main. Spawns the fork's web profile as an
 * ELECTRON_RUN_AS_NODE child (option d: out-of-process Host), waits for the
 * loopback URL on stdout, then loads it in a sandboxed BrowserWindow.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, app, session } from 'electron';

const HERE = dirname(fileURLToPath(import.meta.url));
const FORK = join(HERE, '..', 'packages', 'deepseek-harness');
const TIMEOUT_MS = 120_000;

const gotUrl = new Promise((resolve, reject) => {
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
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );
  app.on('quit', () => child.kill('SIGKILL'));
  let buffer = '';
  const timer = globalThis.setTimeout(
    () => reject(new Error(`timeout; captured:\n${buffer.slice(-3000)}`)),
    TIMEOUT_MS,
  );
  child.stdout.on('data', (chunk) => {
    buffer += String(chunk);
    process.stdout.write(String(chunk));
    const match = buffer.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+)/);
    if (match !== null) {
      globalThis.clearTimeout(timer);
      resolve({ url: match[1], child });
    }
  });
  child.on('exit', (code) => {
    reject(new Error(`host child exited early with code ${String(code)}`));
  });
});

app.whenReady().then(async () => {
  try {
    const { url, child } = await gotUrl;
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
      callback(false),
    );
    const window = new BrowserWindow({
      width: 1200,
      height: 800,
      show: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    window.webContents.setWindowOpenHandler(({ url: target }) => {
      if (target.startsWith(url)) return { action: 'allow' };
      return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event, target) => {
      if (!target.startsWith(url)) event.preventDefault();
    });
    await window.loadURL(url);
    const title = await window.webContents.executeJavaScript('document.title');
    console.log(`SPIKE_ELECTRON_OK url=${url} title=${JSON.stringify(title)}`);
    child.kill('SIGTERM');
    globalThis.setTimeout(() => {
      child.kill('SIGKILL');
      app.quit();
    }, 2000);
  } catch (error) {
    console.error(`SPIKE_ELECTRON_FAIL ${String(error?.message ?? error)}`);
    app.exit(1);
  }
});
