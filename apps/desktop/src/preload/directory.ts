/**
 * Isolated preload: exposes ONLY the desktop directory bridge the official
 * Web surface needs for Windows folder selection and local directory
 * drag-drop. No Node, no broad Electron surface — just two typed calls over
 * `contextBridge`, with the dialog work performed in the main process.
 * @module apps/desktop/preload/directory
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('desktopDirectory', {
  /** Ask the main process for a directory; resolves undefined when cancelled. */
  selectDirectory(): Promise<string | undefined> {
    return ipcRenderer.invoke('desktop:select-directory') as Promise<string | undefined>;
  },
  /** Resolve a dropped File to its absolute filesystem path (webUtils sandbox). */
  pathForFile(file: File): string {
    return webUtils.getPathForFile(file);
  },
});
