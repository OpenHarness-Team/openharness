/**
 * Electron main entry: thin host. Acquires the single-instance lock, boots
 * the forked DSH Host generation through the launcher, and loads the
 * official Web UI from the loopback carrier in a sandboxed window. No
 * renderer IPC, no preload, no Electron API in the page.
 * @module apps/desktop/main
 */

import { type BrowserWindow, app } from 'electron';
import { Launcher } from './launcher.js';
import { type TrayHandlers, createTray } from './tray.js';
import { createMainWindow } from './window.js';

const launcher = new Launcher();
let mainWindow: BrowserWindow | undefined;
let trayCreated = false;
let tearingDown = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow === undefined) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(async () => {
    try {
      const carrierUrl = await launcher.start();
      mainWindow = createMainWindow(carrierUrl, launcher.activeMode());
      mainWindow.webContents.once('did-finish-load', () => {
        // Tray creation and last-known-good commit happen only after the Web
        // surface loads; the commit completes synchronously before tray
        // commands can run.
        launcher.commitLastKnownGood();
        if (!trayCreated) {
          trayCreated = true;
          const handlers: TrayHandlers = {
            onShow: () => {
              if (mainWindow === undefined) return;
              if (mainWindow.isMinimized()) mainWindow.restore();
              mainWindow.show();
              mainWindow.focus();
            },
            onRestart: () => launcher.requestRestart('tray-command'),
            onQuit: () => app.quit(),
            onSetMode: (mode) => launcher.setMode(mode),
            activeMode: () => launcher.activeMode(),
          };
          createTray(handlers);
        }
      });
      mainWindow.on('closed', () => {
        mainWindow = undefined;
      });
    } catch (error) {
      console.error(
        `[main] generation boot failed: ${String(error instanceof Error ? error.message : error)}`,
      );
      app.exit(1);
    }
  });

  // v1 lifecycle: closing the window quits the application on every
  // platform; tray-persistent behavior arrives with the Phase 4 runtime.
  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', (event) => {
    if (tearingDown) return;
    tearingDown = true;
    event.preventDefault();
    void launcher.disposeAll().finally(() => {
      app.exit(0);
    });
  });
}
