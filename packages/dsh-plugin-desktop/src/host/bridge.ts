/**
 * `desktop-bridge` Host row: provides `ctx.desktopRuntime` over the
 * Host↔launcher control channel (option d seam — the Host runs in a child
 * process, so the launcher cannot provide the adapter into its ctx
 * directly). The row announces itself on mount and forwards lifecycle
 * requests as token-authenticated loopback POSTs; apps/desktop owns every
 * execution decision. Scaffold tray/window contributions are fire-and-forget
 * announcements until the tray command registry lands (refactor Phase 5).
 * @module dsh-plugin-desktop/host/bridge
 */

import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { CordisContext } from '../internal/context.js';
import type {
  DesktopRestartReason,
  DesktopRuntime,
  DesktopTrayItem,
  DesktopWindowValues,
} from '../runtime.js';

// The `desktopRuntime` context slot is declared by ../runtime.ts (the
// contract module); DesktopBridge satisfies it structurally.

/** Launcher-composed row config: the control channel endpoint. */
export interface Config {
  /** Control server base URL (http://127.0.0.1:N, launcher-owned). */
  controlUrl: string;
  /** Bearer token minted per generation by the launcher. */
  token: string;
}

/** `ctx.desktopRuntime` implementation backed by the control channel. */
export class DesktopBridge extends Service implements DesktopRuntime {
  static Config: z<Config> = z.object({
    controlUrl: z.string().required(),
    token: z.string().required(),
  });

  constructor(
    ctx: CordisContext,
    private readonly config: Config,
  ) {
    super(ctx, 'desktopRuntime');
    this.post('/bridge/register', { row: 'desktop-bridge' });
  }

  /** Fire-and-forget authenticated POST; the launcher owns execution semantics. */
  private post(path: string, payload: object): void {
    void fetch(`${this.config.controlUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-desktop-token': this.config.token },
      body: JSON.stringify(payload),
    }).catch((error: unknown) => {
      console.error(
        `desktop-bridge: ${path} failed: ${String(error instanceof Error ? error.message : error)}`,
      );
    });
  }

  /** Request an orderly restart; the launcher coordinator decides and executes. */
  requestRestart(reason: DesktopRestartReason): void {
    this.post('/bridge/restart', { reason });
  }

  /** Tray contributions announced to the launcher's physical tray. */
  get trayItems(): DesktopRuntime['trayItems'] {
    return {
      register: (item: DesktopTrayItem): (() => void) => {
        this.post('/bridge/tray-register', {
          id: item.id,
          label: item.label,
          enabled: item.enabled ?? true,
        });
        return () => {
          this.post('/bridge/tray-remove', { id: item.id });
        };
      },
    };
  }

  /** Window values announced for the launcher's BrowserWindow construction. */
  registerWindowValues(values: DesktopWindowValues): () => void {
    this.post('/bridge/window-values', values);
    return () => undefined;
  }
}

export default DesktopBridge;
