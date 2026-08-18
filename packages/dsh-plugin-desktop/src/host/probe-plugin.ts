/**
 * Diagnostic row (not part of the desktop layer): proves packaged
 * `ctx.desktopPnpm.runPlugin()` end-to-end through Cordis injection. On mount
 * it runs `dsh plugin --profile <active> --version` (the fork forwards this
 * to pnpm on PATH) and prints `PROBE_PLUGIN_DONE` once the process tree exits.
 * @module dsh-plugin-desktop/host/probe-plugin
 */

import type { CordisContext } from '../internal/context.js';
import type { DesktopPnpm, DesktopPnpmOutcome } from '../pnpm.js';
import type { DesktopProfiles } from '../profile-service.js';

/** Injected-service view; casts justified by internal/context.ts (dual type identity). */
interface InjectedView {
  desktopProfiles: DesktopProfiles;
  desktopPnpm: DesktopPnpm;
}

/** Probe plugin: exercises the same public service a third-party row would. */
export default function probePlugin(ctx: CordisContext): void {
  ctx.inject(['desktopProfiles', 'desktopPnpm'], (injected) => {
    const view = injected as unknown as InjectedView;
    console.log(`PROBE_PLUGIN injected profile=${view.desktopProfiles.current.name}`);
    const handle = view.desktopPnpm.runPlugin(['--version'], process.cwd());
    let output = '';
    handle.stdout.on('data', (chunk: Buffer | string) => {
      output += String(chunk);
    });
    void handle.done.then((outcome: DesktopPnpmOutcome) => {
      console.log(`PROBE_PLUGIN_DONE exit=${String(outcome.exitCode)} version=${output.trim()}`);
    });
  });
}
