/**
 * Host face barrel: the three desktop Host rows composed by the launcher as a
 * bundle layer after `dsh-web-app`. Each row is also importable directly
 * through its subpath for cordis.patch.yml rows.
 * @module dsh-plugin-desktop/host
 */

export { default as DesktopProfilesService } from './profiles.js';
export { default as DesktopPnpmService } from './pnpm.js';
export { default as DesktopShell } from './shell.js';
