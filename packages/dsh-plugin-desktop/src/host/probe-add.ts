/**
 * Diagnostic row (not part of the desktop layer): drives a real packaged
 * `dsh plugin add <tarball>` through `ctx.desktopPnpm.runPlugin()`. The
 * tarball path arrives via `SMOKE_PLUGIN_TARBALL` (smoke-only private env,
 * not a public contract).
 * @module dsh-plugin-desktop/host/probe-add
 */

import type { CordisContext } from '../internal/context.js';
import type { DesktopPnpm, DesktopPnpmOutcome } from '../pnpm.js';
import type { DesktopProfiles } from '../profile-service.js';

/** Injected-service view; casts justified by internal/context.ts (dual type identity). */
interface InjectedView {
  desktopProfiles: DesktopProfiles;
  desktopPnpm: DesktopPnpm;
}

/** Probe plugin: consumes the public services exactly as a third-party row would. */
export default function probeAdd(ctx: CordisContext): void {
  ctx.inject(['desktopProfiles', 'desktopPnpm'], (injected) => {
    const view = injected as unknown as InjectedView;
    const tarball = process.env.SMOKE_PLUGIN_TARBALL;
    if (tarball === undefined || tarball.length === 0) {
      console.log('PROBE_ADD_DONE exit=1 error=missing SMOKE_PLUGIN_TARBALL');
      return;
    }
    console.log(
      `PROBE_ADD injected profile=${view.desktopProfiles.current.name} tarball=${tarball}`,
    );
    const handle = view.desktopPnpm.runPlugin(['add', tarball], process.cwd());
    let output = '';
    handle.stdout.on('data', (chunk: Buffer | string) => {
      output += String(chunk);
    });
    handle.stderr.on('data', (chunk: Buffer | string) => {
      output += String(chunk);
    });
    void handle.done.then((outcome: DesktopPnpmOutcome) => {
      console.log(
        `PROBE_ADD_DONE exit=${String(outcome.exitCode)} output=${JSON.stringify(output.trim())}`,
      );
    });
  });
}
