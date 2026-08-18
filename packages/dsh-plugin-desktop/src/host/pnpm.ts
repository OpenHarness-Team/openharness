/**
 * `desktop-pnpm` Host row: provides `ctx.desktopPnpm`, managed package
 * operations against the immutable active profile. Dev-stage scaffold: argv
 * crosses the process boundary shell-free through `node:child_process` with
 * launcher-composed commands; the packaged runtime (refactor Phase 4) swaps
 * executable selection and the child-only environment (DSH home,
 * Electron-backed Node helper, CI, ABI values) without changing this
 * contract. One operation per generation.
 * @module dsh-plugin-desktop/host/pnpm
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { delimiter, isAbsolute } from 'node:path';
import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { CordisContext } from '../internal/context.js';
import type { DesktopPnpm, DesktopPnpmHandle, DesktopPnpmOutcome } from '../pnpm.js';

declare module '@deepseek-ai/cordis' {
  interface Context {
    desktopPnpm: DesktopPnpmService;
  }
}

/** Launcher-composed row config: executable selection for this deployment. */
export interface Config {
  /** Command prefix executing pnpm (dev: `pnpm` from PATH). */
  pnpmCommand: string[];
  /**
   * Command prefix executing the DSH CLI (`dsh plugin --profile <active>`).
   * Empty until the launcher composes it; `runPlugin()` fails loud without it.
   */
  dshCommand: string[];
  /**
   * Directories prepended to PATH for managed child processes. Packaged mode
   * points this at launcher-generated `pnpm`/`node` shims over the Electron
   * binary (no ambient package manager on a user machine).
   */
  pathPrepend: string[];
  /**
   * Environment overrides for managed child processes (for example DSH_HOME
   * so `dsh plugin` resolves the same profiles as the launcher).
   */
  extraEnv: Record<string, string>;
}

/** Validate a shell-free argv: non-empty, every entry a NUL-free string. */
function assertArgv(args: readonly string[], what: string): void {
  if (args.length === 0) throw new TypeError(`${what}: empty argv`);
  for (const arg of args) {
    if (typeof arg !== 'string' || arg.includes('\0')) {
      throw new TypeError(`${what}: invalid argv entry ${JSON.stringify(arg)}`);
    }
  }
}

/** One live operation owned by the service; settles after the process exits. */
class OperationHandle implements DesktopPnpmHandle {
  readonly done: Promise<DesktopPnpmOutcome>;
  constructor(private readonly child: ChildProcess) {
    this.done = new Promise<DesktopPnpmOutcome>((resolve) => {
      child.once('exit', (exitCode, signal) => resolve({ exitCode, signal }));
    });
  }
  get stdout(): NodeJS.ReadableStream {
    return this.child.stdout ?? process.stdin;
  }
  get stderr(): NodeJS.ReadableStream {
    return this.child.stderr ?? process.stdin;
  }
  cancel(): void {
    this.child.kill('SIGTERM');
  }
}

/** Managed pnpm/dsh operations for the active profile. */
export class DesktopPnpmService extends Service implements DesktopPnpm {
  static Config: z<Config> = z.object({
    pnpmCommand: z.array(z.string()).required(),
    dshCommand: z.array(z.string()).required(),
    pathPrepend: z.array(z.string()).default([]),
    extraEnv: z.dict(z.string()).default({}),
  });

  private active: OperationHandle | undefined;

  constructor(
    ctx: CordisContext,
    private readonly config: Config,
  ) {
    super(ctx, 'desktopPnpm');
  }

  /** Direct pnpm argv in the active profile directory; no DSH semantics promised. */
  run(args: readonly string[], signal?: AbortSignal): DesktopPnpmHandle {
    assertArgv(args, 'desktopPnpm.run');
    const profiles = this.ctx.get('desktopProfiles');
    if (profiles === undefined)
      throw new Error('desktopPnpm.run requires the desktopProfiles service');
    return this.start([...this.config.pnpmCommand, ...args], profiles.current.dir, signal);
  }

  /** `dsh plugin --profile <active>` argv from the caller's absolute directory. */
  runPlugin(args: readonly string[], invokingDir: string, signal?: AbortSignal): DesktopPnpmHandle {
    assertArgv(args, 'desktopPnpm.runPlugin');
    if (!isAbsolute(invokingDir) || invokingDir.includes('\0')) {
      throw new TypeError(
        `desktopPnpm.runPlugin: invokingDir must be absolute and NUL-free, got ${JSON.stringify(invokingDir)}`,
      );
    }
    if (this.config.dshCommand.length === 0) {
      throw new Error(
        'desktopPnpm.runPlugin: launcher did not compose dshCommand (Phase 4 packaged runtime)',
      );
    }
    const profiles = this.ctx.get('desktopProfiles');
    if (profiles === undefined)
      throw new Error('desktopPnpm.runPlugin requires the desktopProfiles service');
    const argv = [...this.config.dshCommand, 'plugin', '--profile', profiles.current.name, ...args];
    return this.start(argv, invokingDir, signal);
  }

  /** Single-operation gate, spawn, and abort wiring shared by both methods. */
  private start(argv: readonly string[], cwd: string, signal?: AbortSignal): DesktopPnpmHandle {
    if (this.active !== undefined)
      throw new Error('desktopPnpm: one operation per generation is already running');
    const env = { ...process.env, ...this.config.extraEnv };
    if (this.config.pathPrepend.length > 0) {
      env.PATH = [...this.config.pathPrepend, process.env.PATH ?? '']
        .filter((entry) => entry.length > 0)
        .join(delimiter);
    }
    const child = spawn(argv[0] ?? '', argv.slice(1), {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    const handle = new OperationHandle(child);
    this.active = handle;
    void handle.done.then(() => {
      if (this.active === handle) this.active = undefined;
    });
    signal?.addEventListener(
      'abort',
      () => {
        child.kill('SIGTERM');
      },
      { once: true },
    );
    return handle;
  }
}

export default DesktopPnpmService;
