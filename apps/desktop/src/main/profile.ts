/**
 * Launcher-managed `desktop` profile. The fork ships only `web` and
 * `headless` templates, so the launcher owns this profile's creation and
 * repair. Deliberately Electron-free: headless-testable through the fork's
 * tsx (see spike/profile-ensure.mjs).
 *
 * v1 semantics: create the profile when absent; an existing manifest with
 * exactly the installation-owned bundle tuple is kept verbatim; a
 * user-modified bundle list is preserved untouched. The desktop layer rides
 * as a launch-time `--patch` overlay in every case, so row composition never
 * depends on the profile manifest. Full installation-owned-prefix repair with
 * third-party order preservation iterates with the `dsh plugin` wiring
 * (refactor Phase 4).
 * @module apps/desktop/main/profile
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The launcher-managed profile name. */
export const DESKTOP_PROFILE_NAME = 'desktop';

/** Installation-owned bundle tuple in composition order. */
export const INSTALLATION_OWNED_BUNDLES = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
] as const;

/** The profile manifest shape the fork's loadProfile consumes. */
export interface ProfileManifest {
  name: string;
  private: boolean;
  dependencies: Record<string, string>;
  dsh?: { profile?: { bundles?: string[] } };
}

/** Absolute directory of one profile under a DSH home. */
export function profileDir(home: string, name: string = DESKTOP_PROFILE_NAME): string {
  return join(home, 'profiles', name);
}

/** Fresh installation-owned manifest for the desktop profile. */
export function freshDesktopManifest(): ProfileManifest {
  return {
    name: `dsh-profile-${DESKTOP_PROFILE_NAME}`,
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: [...INSTALLATION_OWNED_BUNDLES] } },
  };
}

/** True when the bundle list equals the installation-owned tuple in order. */
export function isInstallationOwned(bundles: readonly string[] | undefined): boolean {
  if (bundles === undefined || bundles.length !== INSTALLATION_OWNED_BUNDLES.length) return false;
  return INSTALLATION_OWNED_BUNDLES.every((bundle, index) => bundles[index] === bundle);
}

export interface EnsureResult {
  dir: string;
  /** True when this call created the manifest (first-use onboarding). */
  created: boolean;
  /** True when an existing manifest is user-owned (left untouched). */
  userOwned: boolean;
}

/**
 * Ensure the desktop profile exists under the DSH home; never rewrites a
 * user-owned manifest. Returns the profile directory and ownership facts.
 */
export function ensureDesktopProfile(home: string): EnsureResult {
  const dir = profileDir(home);
  const manifestPath = join(dir, 'package.json');
  if (!existsSync(manifestPath)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(manifestPath, `${JSON.stringify(freshDesktopManifest(), undefined, 2)}\n`);
    return { dir, created: true, userOwned: false };
  }
  let manifest: ProfileManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ProfileManifest;
  } catch {
    // Unreadable/corrupt manifest: fail loud rather than silently replacing
    // user data; the launcher surfaces this as a boot rejection.
    throw new Error(`desktop profile manifest is unreadable: ${manifestPath}`);
  }
  return { dir, created: false, userOwned: !isInstallationOwned(manifest.dsh?.profile?.bundles) };
}
