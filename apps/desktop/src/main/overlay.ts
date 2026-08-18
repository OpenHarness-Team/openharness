/**
 * Desktop-layer overlay composition. The launcher inserts the desktop rows
 * after `dsh-web-app` for the active generation ONLY: the overlay is written
 * to Electron user data and passed as a launch-time `--patch`, never
 * persisted into the selected profile's bundle list.
 * @module apps/desktop/main/overlay
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Presentation mode the generation is composed for (advanced: Phase 5). */
export type DesktopMode = 'compatibility' | 'advanced';

export interface OverlayInput {
  /** Built dsh-plugin-desktop lib directory (absolute-path row specifiers). */
  pluginLibDir: string;
  /** Active profile identity injected into desktop-profiles. */
  profileName: string;
  /** Absolute manifest directory injected into desktop-profiles. */
  profileDir: string;
  /** Composed presentation mode injected into desktop-shell. */
  mode: DesktopMode;
  /** Directory receiving the generated overlay file (Electron user data). */
  outDir: string;
  /** Control channel base URL injected into desktop-bridge (Host↔launcher seam). */
  controlUrl: string;
  /** Control channel bearer token injected into desktop-bridge. */
  controlToken: string;
}

/**
 * Write the desktop-layer overlay and return its absolute path. Specifiers
 * are absolute filesystem paths because the Host child resolves bare package
 * names from the fork installation, where dsh-plugin-desktop is not
 * installed (consumption decision d).
 */
export function composeDesktopLayer(input: OverlayInput): string {
  mkdirSync(input.outDir, { recursive: true });
  const overlay = join(input.outDir, 'desktop-layer.yml');
  const lib = input.pluginLibDir;
  const lines = [
    '# Launcher-composed desktop layer (generated; do not edit). Inserted',
    '# after dsh-web-app for this generation only; never persisted into the',
    '# profile bundle list.',
    '- insert:',
    '    - id: desktop-profiles',
    `      name: '${lib}/host/profiles.js'`,
    '      config:',
    `        name: '${input.profileName}'`,
    `        dir: '${input.profileDir}'`,
    '    - id: desktop-pnpm',
    `      name: '${lib}/host/pnpm.js'`,
    '      config:',
    '        pnpmCommand:',
    "          - 'pnpm'",
    '        dshCommand: []',
    '    - id: desktop-shell',
    `      name: '${lib}/host/shell.js'`,
    '      config:',
    `        mode: '${input.mode}'`,
    '    - id: desktop-bridge',
    `      name: '${lib}/host/bridge.js'`,
    '      config:',
    `        controlUrl: '${input.controlUrl}'`,
    `        token: '${input.controlToken}'`,
    '',
  ];
  writeFileSync(overlay, lines.join('\n'));
  return overlay;
}
