/**
 * `desktop-shell` Host row: registers the `dsh-desktop` settings namespace
 * (single source of truth for the presentation mode) and converts committed
 * mode changes into restart requests through the launcher seam. Window, tray,
 * and close-versus-quit ownership live in apps/desktop; this row contributes
 * effect-scoped requests and tray items only. Linux advanced-mode rejection
 * lands in Phase 5 with the advanced presentation.
 * @module dsh-plugin-desktop/host/shell
 */

import { Service } from '@deepseek-ai/cordis';
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';
import z from '@deepseek-ai/schemastery';
import type { CordisContext } from '../internal/context.js';

declare module '@deepseek-ai/cordis' {
  interface Context {
    desktopShell: DesktopShell;
  }
}

/** The `dsh-desktop.mode` presentation mode persisted in DSH home settings.yaml. */
export type DesktopMode = 'compatibility' | 'advanced';

/** Launcher-composed row config: the mode this generation was composed for. */
export interface Config {
  mode: DesktopMode;
}

/** Settings namespace registered with the standard settings service. */
export const DESKTOP_SETTINGS_NAMESPACE = 'dsh-desktop' as const;

/** Desktop settings section: the mode field plus restart applicability. */
export class DesktopShell extends Service {
  static Config: z<Config> = z.object({
    mode: z.union([z.const('compatibility'), z.const('advanced')]).required(),
  });

  /** Currently authoritative mode source: settings scope while attached, else the entry. */
  private source: () => Config = () => this.config;

  constructor(
    ctx: CordisContext,
    private readonly config: Config,
  ) {
    super(ctx, 'desktopShell');
    // Cast justified by internal/context.ts: dsh-settings imports Context via
    // the cordis package root while Service's parameter uses the relative
    // declaration; both name the same runtime interface.
    const settingsCtx = ctx as unknown as Parameters<typeof installSettingsSection>[0];
    installSettingsSection(
      settingsCtx,
      settingsNamespace(DESKTOP_SETTINGS_NAMESPACE),
      DesktopShell.Config,
      config,
      {
        setSource: (current) => {
          this.source = current;
        },
        onChange: () => {
          // The restart coordinator lives in apps/desktop; a committed mode that
          // differs from this generation's composed mode requests exactly one
          // orderly restart (relaunch happens only after zero-code disposal).
          if (this.source().mode !== this.config.mode) {
            this.ctx.get('desktopRuntime')?.requestRestart('settings-committed');
          }
        },
      },
    );
  }

  /** The mode this generation was composed with (generation-immutable). */
  get generationMode(): DesktopMode {
    return this.config.mode;
  }
}

export default DesktopShell;
