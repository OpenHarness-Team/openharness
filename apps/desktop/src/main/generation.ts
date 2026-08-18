/**
 * One Host generation: the fork's DSH Host running as an
 * ELECTRON_RUN_AS_NODE child process inside the fork workspace (consumption
 * decision d). The launcher supervises; nothing here touches Electron APIs,
 * keeping the supervision logic headless-testable.
 *
 * Hard launcher rules proven by the spike: the child argv carries
 * `--expose-internals` (fork bare-plugin resolution needs Node's internal
 * loader; node-addon-require-builtin is unsupported under Electron) and the
 * webserver binds an ephemeral port (`--port 0`) on 127.0.0.1.
 * @module apps/desktop/main/generation
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { join } from 'node:path';

/** Loopback URL line printed by the fork's web-runtime after settlement. */
const WEB_URL_PATTERN = /dsh web: (http:\/\/127\.0\.0\.1:\d+)/;

/** How the Host entry is launched inside the child. */
export type HostMode = 'source' | 'packaged';

export interface GenerationOptions {
  /** Electron binary; runs as Node with ELECTRON_RUN_AS_NODE=1. */
  electronBinary: string;
  /** Host runtime directory; the child cwd (module resolution stays in-tree). */
  runtimeDir: string;
  /** Dev boots the fork source via tsx; packaged boots the built dsh bin. */
  hostMode: HostMode;
  /** Profile to boot. */
  profile: string;
  /** Absolute path of the launcher-composed desktop-layer overlay. */
  overlayPath: string;
  /** Optional environment overrides layered over process.env. */
  env?: NodeJS.ProcessEnv;
  /** Prefix for forwarded host logs. */
  logPrefix?: string;
}

export interface GenerationExit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export interface Generation {
  readonly pid: number | undefined;
  /** Settles with the loopback URL once the host prints it. */
  readonly url: Promise<string>;
  /** Settles when the child process exits. */
  readonly exit: Promise<GenerationExit>;
  /** Orderly teardown: SIGTERM, bounded grace, SIGKILL; settles at exit. */
  dispose(): Promise<GenerationExit>;
}

/** Grace between SIGTERM and SIGKILL during disposal. */
const DISPOSE_GRACE_MS = 8_000;

/** Start one Host generation and wire its supervision handles. */
export function startGeneration(options: GenerationOptions): Generation {
  // Both modes carry --expose-internals: the fork's bare-plugin resolution
  // needs Node's internal loader, and node-addon-require-builtin is
  // unsupported under Electron (spike finding). Source mode boots the fork's
  // tsx entry; packaged mode boots the staged built dsh bin.
  const hostArgv =
    options.hostMode === 'source'
      ? ['--expose-internals', '--import', 'tsx/esm', 'apps/cli/src/bin.ts']
      : [
          '--expose-internals',
          join(options.runtimeDir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
        ];
  const child: ChildProcess = spawn(
    options.electronBinary,
    [...hostArgv, '--profile', options.profile, '--patch', options.overlayPath, '--port', '0'],
    {
      cwd: options.runtimeDir,
      env: { ...process.env, ...options.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  const prefix = options.logPrefix ?? '[host]';
  let stdoutBuffer = '';

  const url = new Promise<string>((resolveUrl, rejectUrl) => {
    const fail = (reason: string): void => {
      rejectUrl(new Error(`generation failed before serving: ${reason}`));
    };
    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdoutBuffer += text;
      for (const line of text.split('\n')) {
        if (line.trim().length > 0) console.log(`${prefix} ${line}`);
      }
      const match = stdoutBuffer.match(WEB_URL_PATTERN);
      if (match !== null) resolveUrl(match[1] ?? '');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.trim().length > 0) console.error(`${prefix} ${line}`);
      }
    });
    child.once('error', (error) => fail(error.message));
    child.once('exit', (code, signal) => {
      if (stdoutBuffer.match(WEB_URL_PATTERN) === null) {
        fail(`child exited (code=${String(code)} signal=${String(signal ?? 'none')})`);
      }
    });
  });

  const exit = new Promise<GenerationExit>((resolveExit) => {
    child.once('exit', (code, signal) => resolveExit({ code, signal }));
  });

  let disposing: Promise<GenerationExit> | undefined;
  const dispose = (): Promise<GenerationExit> => {
    if (disposing !== undefined) return disposing;
    disposing = (async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        const grace = new Promise<void>((resolveGrace) => {
          const timer = globalThis.setTimeout(resolveGrace, DISPOSE_GRACE_MS);
          timer.unref?.();
          void exit.then(() => resolveGrace());
        });
        await grace;
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }
      return exit;
    })();
    return disposing;
  };

  return { pid: child.pid, url, exit, dispose };
}
