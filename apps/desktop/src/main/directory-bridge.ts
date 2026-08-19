/**
 * Main-process half of the desktop directory bridge. The preload exposes a
 * typed `desktopDirectory` object; this module owns the `dialog.showOpenDialog`
 * work and returns the absolute selected path (or undefined on cancel). It
 * stays behind the same 127.0.0.1 navigation boundary as the rest of the
 * app, with no arbitrary renderer IPC surface.
 * @module apps/desktop/main/directory-bridge
 */

import { dialog, ipcMain } from 'electron';

/** IPC channel the isolated preload invokes. */
export const DIRECTORY_SELECT_CHANNEL = 'desktop:select-directory';

/** Install the directory-selection IPC handler once during app startup. */
export function registerDirectoryBridge(): void {
  ipcMain.handle(DIRECTORY_SELECT_CHANNEL, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select a folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled || result.filePaths.length === 0 ? undefined : result.filePaths[0];
  });
}
