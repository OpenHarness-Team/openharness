/**
 * Public contract of the `ctx.desktopProfiles` Host service. Third-party Host
 * plugins may depend on this contract but MUST treat the service as optional:
 * under ordinary DSH (no desktop launcher) it does not exist. Type-only import:
 * `import type { DesktopProfiles } from 'dsh-plugin-desktop/profile-service'`.
 * @module dsh-plugin-desktop/profile-service
 */

/** One discovered profile as surfaced by `list()` read-only discovery. */
export interface DesktopProfileSummary {
  /** Profile name (launcher-owned state, never guessed from argv or URL). */
  readonly name: string;
  /** Absolute manifest directory of the profile. */
  readonly dir: string;
  /** False for visible-but-unselectable profiles (headless, malformed, desktop-embedded). */
  readonly selectable: boolean;
  /** Why a visible profile is not selectable; absent when selectable. */
  readonly reason?: string;
}

/** Immutable identity of the profile that produced the running generation. */
export interface DesktopCurrentProfile {
  readonly name: string;
  readonly dir: string;
}

/**
 * Generation-scoped profile identity and switching service provided by the
 * desktop launcher composition. `current` is fixed for one Cordis generation;
 * `select()` is a restart operation, never an in-place mutation.
 */
export interface DesktopProfiles {
  readonly current: DesktopCurrentProfile;
  /** Read-only discovery; never rewrites profile manifests, patches, or bundle order. */
  list(): readonly DesktopProfileSummary[];
  /** Persist the accepted target, then request an orderly restart. */
  select(name: string): Promise<void>;
}
