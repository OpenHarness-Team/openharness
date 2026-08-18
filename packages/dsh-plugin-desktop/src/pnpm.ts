/**
 * Public contract of the `ctx.desktopPnpm` Host service. Plugin add, remove,
 * and update MUST go through `runPlugin()` (the upstream `dsh plugin`
 * semantics stay authoritative); `run()` is a low-level escape hatch without
 * DSH profile reconciliation. Third-party consumers MUST treat the service as
 * optional under ordinary DSH. Type-only import:
 * `import type { DesktopPnpm } from 'dsh-plugin-desktop/pnpm'`.
 * @module dsh-plugin-desktop/pnpm
 */

/** Settlement of one managed operation, after the complete process tree exits. */
export interface DesktopPnpmOutcome {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
}

/** Live handle of one managed operation. One operation per generation. */
export interface DesktopPnpmHandle {
  readonly stdout: NodeJS.ReadableStream;
  readonly stderr: NodeJS.ReadableStream;
  /** Settles only after the complete process tree exits. */
  readonly done: Promise<DesktopPnpmOutcome>;
  cancel(): void;
}

/** Managed package operations against the immutable active profile. */
export interface DesktopPnpm {
  /**
   * Execute packaged pnpm directly with the active profile directory as cwd.
   * Low-level: does NOT promise profile initialization, caller-relative source
   * anchoring, or `dsh.profile.bundles` reconciliation.
   */
  run(args: readonly string[], signal?: AbortSignal): DesktopPnpmHandle;
  /**
   * Execute `dsh plugin --profile <active> <args...>` with the absolute caller
   * directory as the CLI working directory. The required path for plugin add,
   * remove, update, and dependency repair.
   */
  runPlugin(args: readonly string[], invokingDir: string, signal?: AbortSignal): DesktopPnpmHandle;
}
