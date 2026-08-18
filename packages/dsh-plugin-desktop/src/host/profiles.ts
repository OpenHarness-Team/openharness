/**
 * `desktop-profiles` Host row: provides `ctx.desktopProfiles` for one Cordis
 * generation. The launcher composes this row with the active profile identity
 * (a patch replaces the whole row config, so the launcher restates every
 * field). Scaffold scope: `current` and `list()` are config-driven; full
 * read-only discovery and persist-before-restart selection land with the
 * apps/desktop launcher (refactor Phase 3).
 * @module dsh-plugin-desktop/host/profiles
 */

import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { CordisContext } from '../internal/context.js';
import type {
  DesktopCurrentProfile,
  DesktopProfileSummary,
  DesktopProfiles,
} from '../profile-service.js';

declare module '@deepseek-ai/cordis' {
  interface Context {
    desktopProfiles: DesktopProfilesService;
  }
}

/** Launcher-composed row config: the active profile identity. */
export interface Config {
  /** Active profile name chosen by the launcher. */
  name: string;
  /** Absolute manifest directory of the active profile. */
  dir: string;
}

/** Generation-scoped profile identity service. */
export class DesktopProfilesService extends Service implements DesktopProfiles {
  static Config: z<Config> = z.object({
    name: z.string().required(),
    dir: z.string().required(),
  });

  constructor(
    ctx: CordisContext,
    private readonly config: Config,
  ) {
    super(ctx, 'desktopProfiles');
  }

  /** Immutable for this generation; read fresh from the next generation after a switch. */
  get current(): DesktopCurrentProfile {
    return { name: this.config.name, dir: this.config.dir };
  }

  /**
   * Scaffold: reports only the active profile. Full read-only discovery of all
   * profiles (with selectable/reason markers) is a Phase 3 launcher task.
   */
  list(): readonly DesktopProfileSummary[] {
    return [{ name: this.config.name, dir: this.config.dir, selectable: true }];
  }

  /**
   * Request a profile switch. Scaffold: delegates straight to the launcher's
   * restart seam; persist-before-restart serialization (pending target under
   * Electron user data, concurrent-call sharing, rollback retention) lands in
   * Phase 3 with the restart coordinator.
   */
  async select(name: string): Promise<void> {
    if (name.length === 0 || name.includes('\0')) {
      throw new TypeError(`desktopProfiles.select: invalid profile name ${JSON.stringify(name)}`);
    }
    if (name === this.config.name) return;
    this.ctx.get('desktopRuntime')?.requestRestart('profile-switch');
  }
}

export default DesktopProfilesService;
