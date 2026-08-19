/**
 * Sandboxed main window over the loopback carrier. No preload, no Electron
 * API in the page; navigation is pinned to the carrier origin and external
 * links delegate to the operating system. Compatibility chrome keeps the
 * native OS frame; advanced chrome adds the platform native material
 * (macOS sidebar vibrancy, Windows 11 Mica) behind the official surface.
 * @module apps/desktop/main/window
 */

import { BrowserWindow, shell } from 'electron';
import type { DesktopMode } from './overlay.js';

/** Product caption shown by the window. */
export const WINDOW_TITLE = 'DeepSeek Harness Desktop';

/** Platform native-material window options for advanced mode. */
function advancedWindowOptions(mode: DesktopMode): Record<string, unknown> {
  if (mode !== 'advanced') return {};
  switch (process.platform) {
    case 'darwin':
      return {
        titleBarStyle: 'hiddenInset',
        vibrancy: 'sidebar',
        visualEffectState: 'followWindow',
        backgroundColor: '#00000000',
      };
    case 'win32':
      // Mica is drawn by Windows 11 22H2+; Electron exposes the material as
      // backgroundMaterial. Native title-bar controls stay via the overlay.
      return {
        titleBarStyle: 'hidden',
        titleBarOverlay: { height: 32 },
        backgroundMaterial: 'mica',
        backgroundColor: '#00000000',
      };
    default:
      // Linux rejects advanced upstream; the launcher already fell back, so
      // no native-material options apply here.
      return {};
  }
}

/**
 * Create the main window bound to one carrier origin. The window loads the
 * loopback URL; the caller wires did-finish-load for tray creation and
 * last-known-good commit.
 * @param carrierUrl - The generation's loopback origin (http://127.0.0.1:N).
 * @param mode - Presentation mode the generation was composed for.
 * @returns The constructed BrowserWindow.
 */
export function createMainWindow(
  carrierUrl: string,
  mode: DesktopMode = 'compatibility',
): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    title: WINDOW_TITLE,
    show: false,
    autoHideMenuBar: true,
    ...advancedWindowOptions(mode),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // The official page title is suppressed in favor of the product caption.
  window.webContents.on('page-title-updated', (event) => {
    event.preventDefault();
  });

  const sameOrigin = (target: string): boolean =>
    target.startsWith(`${carrierUrl}/`) || target === carrierUrl;
  window.webContents.on('will-navigate', (event, target) => {
    if (!sameOrigin(target)) {
      event.preventDefault();
      if (target.startsWith('http://') || target.startsWith('https://'))
        void shell.openExternal(target);
    }
  });
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith('http://') || target.startsWith('https://'))
      void shell.openExternal(target);
    return { action: 'deny' };
  });

  void window.loadURL(carrierUrl).then(() => window.show());
  return window;
}
