/**
 * Client face of dsh-plugin-desktop. Both presentation modes reuse the
 * loopback Web carrier and the ordinary Client module loader.
 *
 * Compatibility mode (default): validate the Host-supplied mode marker and
 * return without registering services, slots, styles, or presentation — the
 * selected profile keeps its own official layout, sidebar, and conversation
 * composition. Advanced mode (refactor Phase 5) will install the desktop
 * layout service, the root occupant, and the narrow theme presenter.
 * @module dsh-plugin-desktop/client
 */

import type { Context } from '@deepseek-ai/cordis';

/** Client row config: Host-supplied markers validated before any effect. */
export interface Config {
  /** The presentation mode the generation was composed for. */
  mode: 'compatibility' | 'advanced';
  /** Host-supplied platform marker (native materials are platform-bound). */
  platform?: 'darwin' | 'win32' | 'linux';
}

/**
 * Desktop Client plugin. Scaffold: compatibility returns immediately by
 * design; advanced is an explicit no-op until Phase 5 implements the layout
 * service, root occupant, and theme presenter.
 * @param _ctx - Client plugin context (unused in compatibility mode).
 * @param config - Host-supplied mode and platform markers.
 */
export default function desktopClient(_ctx: Context, config: Config): void {
  if (config.mode === 'advanced') {
    // Phase 5: layout service + root occupant + DesktopThemePresenter.
    return;
  }
  // compatibility: deliberately registers nothing.
}
