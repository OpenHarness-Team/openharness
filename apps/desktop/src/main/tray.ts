/**
 * System tray, created ONLY after the Web surface loads successfully (the
 * last-known-good commit completes synchronously before tray commands can
 * run). v1 contributions: show window, restart, quit. Profile/mode command
 * items contributed through the desktop rows' TrayItemRegistry land with the
 * Host↔launcher control channel (refactor Phase 4).
 * @module apps/desktop/main/tray
 */

import { Menu, Tray, nativeImage } from 'electron';
import { type DesktopMode } from './mode.js';
import { WINDOW_TITLE } from './window.js';

/** 16x16 RGBA placeholder mark; product icon replaces it in Phase 4. */
const TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR4nGPwzf73nxLMMGrAqAGjBgwXAwCp8rUfi8BELAAAAABJRU5ErkJggg==';

export interface TrayHandlers {
  onShow(): void;
  onRestart(): void;
  onQuit(): void;
  /** Commit a presentation mode (restarts the generation). */
  onSetMode(mode: DesktopMode): void;
  /** The mode the active generation was composed for. */
  activeMode(): DesktopMode;
}

/** Create the tray with its command menu, including the mode selector. */
export function createTray(handlers: TrayHandlers): Tray {
  const tray = new Tray(nativeImage.createFromDataURL(TRAY_ICON_DATA_URL));
  tray.setToolTip(WINDOW_TITLE);
  const current = handlers.activeMode();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open DSH Desktop', click: handlers.onShow },
      { type: 'separator' },
      {
        label: 'Presentation',
        submenu: [
          {
            label: 'Compatibility',
            type: 'radio',
            checked: current === 'compatibility',
            click: () => handlers.onSetMode('compatibility'),
          },
          {
            label: 'Advanced',
            type: 'radio',
            checked: current === 'advanced',
            // Linux rejects advanced upstream; keep the command visible but inert.
            enabled: process.platform === 'darwin' || process.platform === 'win32',
            click: () => handlers.onSetMode('advanced'),
          },
        ],
      },
      { type: 'separator' },
      { label: 'Restart', click: handlers.onRestart },
      { label: 'Quit', click: handlers.onQuit },
    ]),
  );
  return tray;
}
