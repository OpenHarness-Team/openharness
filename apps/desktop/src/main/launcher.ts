/**
 * The launcher: desktop-private profile state, desktop-profile onboarding,
 * desktop-layer composition, Host generation supervision, and the restart
 * coordinator. Restart execution lives ONLY here (never in the plugin rows):
 * a relaunch happens only after the generation completes an orderly disposal;
 * a failed generation never relaunches.
 * @module apps/desktop/main/launcher
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { type ControlServer, startControlServer } from './control.js';
import { type Generation, startGeneration } from './generation.js';
import {
  type DesktopMode as SettingsMode,
  advancedSupported,
  readMode,
  writeMode,
} from './mode.js';
import { type DesktopMode, composeDesktopLayer } from './overlay.js';
import {
  composeDesktopPnpm,
  dshHome,
  isPackagedRuntime,
  pluginLibDir,
  runtimeDir,
} from './paths.js';
import { DESKTOP_PROFILE_NAME, ensureDesktopProfile } from './profile.js';

/** Desktop-private state persisted under Electron user data. */
interface DesktopState {
  profile: string;
  lastKnownGood: boolean;
}

/** Why the coordinator was asked to restart. */
export type RestartReason =
  | 'profile-switch'
  | 'mode-change'
  | 'settings-committed'
  | 'tray-command';

/**
 * Supervises the single active Host generation and the restart boundary.
 * v1 simplification: a launcher-initiated disposal counts as orderly when the
 * child exits within the bounded grace (SIGTERM exits carry a signal, not a
 * zero code); the strict zero-code rule applies to self-terminated
 * generations and is enforced before any relaunch.
 */
export class Launcher {
  private generation: Generation | undefined;
  private control: ControlServer | undefined;
  private pendingRelaunch = false;
  private launcherInitiatedDispose = false;
  private statePath: string;
  /** Presentation mode the active generation was composed for. */
  private composedMode: DesktopMode = 'compatibility';

  constructor() {
    this.statePath = join(app.getPath('userData'), 'desktop-state.json');
  }

  /** Read persisted desktop state; first launch defaults to the desktop profile. */
  readState(): DesktopState {
    try {
      const parsed = JSON.parse(readFileSync(this.statePath, 'utf8')) as Partial<DesktopState>;
      return {
        profile:
          typeof parsed.profile === 'string' && parsed.profile.length > 0
            ? parsed.profile
            : DESKTOP_PROFILE_NAME,
        lastKnownGood: parsed.lastKnownGood === true,
      };
    } catch {
      return { profile: DESKTOP_PROFILE_NAME, lastKnownGood: false };
    }
  }

  /** Persist desktop state (profile identity and last-known-good marker). */
  writeState(state: DesktopState): void {
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileSync(this.statePath, `${JSON.stringify(state, undefined, 2)}\n`);
  }

  /**
   * Boot the active generation: start the Host↔launcher control channel,
   * ensure the desktop profile, compose the desktop-layer overlay, spawn the
   * Host child, and settle with the loopback URL. The generation-exit watcher
   * arms the restart rules.
   */
  async start(): Promise<string> {
    const state = this.readState();
    const home = dshHome();
    const profile = state.profile === DESKTOP_PROFILE_NAME ? ensureDesktopProfile(home) : undefined;
    const profileDir = profile?.dir ?? join(home, 'profiles', state.profile);

    const control = await startControlServer({
      onBridgeRegistered: (rowId) => console.log(`[launcher] desktop bridge registered (${rowId})`),
      onRestartRequest: (reason) => this.requestRestart(reason),
    });
    this.control = control;

    // The DSH home settings.yaml is the single mode source. Linux rejects an
    // advanced value rather than mapping it to a different presentation.
    const committedMode: SettingsMode = readMode(home);
    const mode: DesktopMode =
      committedMode === 'advanced' && advancedSupported(process.platform)
        ? 'advanced'
        : 'compatibility';
    if (committedMode === 'advanced' && mode === 'compatibility') {
      console.error(
        `[launcher] platform ${process.platform} rejects dsh-desktop.mode: advanced; composing compatibility`,
      );
    }
    this.composedMode = mode;
    const desktopPnpm = composeDesktopPnpm(app.getPath('userData'));

    const overlay = composeDesktopLayer({
      pluginLibDir: pluginLibDir(),
      profileName: state.profile,
      profileDir,
      mode,
      pnpmCommand: desktopPnpm.pnpmCommand,
      dshCommand: desktopPnpm.dshCommand,
      pathPrepend: desktopPnpm.pathPrepend,
      extraEnv: desktopPnpm.extraEnv,
      outDir: app.getPath('userData'),
      controlUrl: control.url,
      controlToken: control.token,
    });

    const generation = startGeneration({
      electronBinary: process.execPath,
      runtimeDir: runtimeDir(),
      hostMode: isPackagedRuntime() ? 'packaged' : 'source',
      profile: state.profile,
      overlayPath: overlay,
    });
    this.generation = generation;

    void generation.exit.then(({ code, signal }) => {
      this.generation = undefined;
      if (this.pendingRelaunch && (this.launcherInitiatedDispose || code === 0)) {
        app.relaunch();
        app.exit(0);
        return;
      }
      if (code !== null && code !== 0) {
        console.error(
          `[launcher] generation failed (code=${String(code)} signal=${String(signal ?? 'none')}); not relaunching`,
        );
      }
    });

    return generation.url;
  }

  /** The presentation mode the active generation was composed for. */
  activeMode(): DesktopMode {
    return this.composedMode;
  }

  /**
   * Commit a presentation mode: persist to the DSH home settings.yaml (the
   * single source of truth), then restart so the next generation composes
   * it. Rejected loudly on unsupported platforms instead of falling back.
   */
  setMode(mode: SettingsMode): void {
    if (mode === 'advanced' && !advancedSupported(process.platform)) {
      console.error(
        `[launcher] platform ${process.platform} does not support advanced mode; selection rejected`,
      );
      return;
    }
    if (mode === this.composedMode) return;
    writeMode(dshHome(), mode);
    this.requestRestart('mode-change');
  }

  /**
   * Request one orderly restart: dispose the generation first, relaunch only
   * after the disposal settles. Idempotent while a restart is pending.
   */
  requestRestart(reason: RestartReason): void {
    if (this.pendingRelaunch) return;
    this.pendingRelaunch = true;
    this.launcherInitiatedDispose = true;
    console.log(`[launcher] restart requested (${reason})`);
    void this.generation?.dispose();
  }

  /** Commit last-known-good after the Web surface loads. */
  commitLastKnownGood(): void {
    const state = this.readState();
    this.writeState({ ...state, lastKnownGood: true });
  }

  /** Tear down the active generation and the control channel (app quit path). */
  async disposeAll(): Promise<void> {
    this.launcherInitiatedDispose = true;
    if (this.generation !== undefined) {
      await this.generation.dispose();
      this.generation = undefined;
    }
    if (this.control !== undefined) {
      await this.control.close();
      this.control = undefined;
    }
  }
}
