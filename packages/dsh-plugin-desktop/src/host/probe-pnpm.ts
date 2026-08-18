/**
 * Diagnostic row (not part of the desktop layer): proves `ctx.desktopPnpm`
 * end-to-end through Cordis injection. On mount it waits for the
 * desktop-profiles and desktop-pnpm services, runs `pnpm --version` through
 * the managed operation handle, and prints a `PROBE_PNPM_DONE` line that the
 * spike smoke asserts on.
 * @module dsh-plugin-desktop/host/probe-pnpm
 */

import type { CordisContext } from '../internal/context.js';
import type { DesktopPnpm, DesktopPnpmOutcome } from '../pnpm.js';
import type { DesktopProfiles } from '../profile-service.js';

/** Injected-service view; casts justified by internal/context.ts (dual type identity). */
interface InjectedView {
  desktopProfiles: DesktopProfiles;
  desktopPnpm: DesktopPnpm;
}

/** Probe plugin: consumes the public desktop services exactly as a third-party row would. */
export default function probePnpm(ctx: CordisContext): void {
  ctx.inject(['desktopProfiles', 'desktopPnpm'], (injected) => {
    const view = injected as unknown as InjectedView;
    console.log(`PROBE_PNPM injected profile=${view.desktopProfiles.current.name}`);
    const handle = view.desktopPnpm.run(['--version']);
    let output = '';
    handle.stdout.on('data', (chunk: Buffer | string) => {
      output += String(chunk);
    });
    void handle.done.then((outcome: DesktopPnpmOutcome) => {
      console.log(`PROBE_PNPM_DONE exit=${String(outcome.exitCode)} version=${output.trim()}`);
    });
  });
}
