/**
 * Internal adapter contract between the two desktop layers: implemented and
 * provided by the launcher (`apps/desktop`), consumed by this package's Host
 * rows. PRIVATE — third-party plugins must not depend on it. Plugins only
 * request lifecycle actions; the launcher decides and executes them
 * (`app.relaunch()` happens only in apps/desktop, after a zero-code Cordis
 * disposal). Rows never hold Electron object references across generations.
 * @module dsh-plugin-desktop/runtime
 */

/** Why a restart was requested; used for restart-coordinator diagnostics. */
export type DesktopRestartReason = 'profile-switch' | 'mode-change' | 'settings-committed';

/** One tray command contribution from a desktop-owned row. */
export interface DesktopTrayItem {
  /** Stable id; later registrations with the same id replace the entry. */
  readonly id: string;
  readonly label: string;
  readonly enabled?: boolean;
  /** Effect-scoped: the contribution disappears with the registering effect. */
  onSelect(): void;
}

/** Ordered tray-item registry owned by the launcher's physical tray. */
export interface TrayItemRegistry {
  /** Contribute one item; returns the disposer removing exactly it. */
  register(item: DesktopTrayItem): () => void;
}

/** Window construction values registered during profile activation. */
export interface DesktopWindowValues {
  readonly title?: string;
  /** macOS only: suppress the visible page title in compatibility mode. */
  readonly suppressPageTitle?: boolean;
  /** Windows only: remove the window menu bar in compatibility mode. */
  readonly removeMenuBar?: boolean;
}

/**
 * Launcher-provided native-capability adapter, present only in desktop
 * generations (read rows use `ctx.get('desktopRuntime')`).
 */
export interface DesktopRuntime {
  /** Request an orderly restart; the launcher's coordinator decides and executes. */
  requestRestart(reason: DesktopRestartReason): void;
  readonly trayItems: TrayItemRegistry;
  /** Register window values consumed when the launcher constructs the BrowserWindow. */
  registerWindowValues(values: DesktopWindowValues): () => void;
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Launcher-owned internal adapter; absent under ordinary DSH. */
    desktopRuntime: DesktopRuntime;
  }
}
