/**
 * `dsh-desktop.mode` plumbing: read and update the presentation mode in the
 * DSH home `settings.yaml` — the single source of truth shared with the
 * desktop-shell settings namespace. The launcher edits the file directly;
 * the running generation's settings-file watcher observes the commit and
 * requests the restart (proven by spike/smoke-bridge.mjs). Deliberately
 * Electron-free: headless-testable through the fork's tsx.
 *
 * The editor performs minimal line surgery on the desktop-owned section only:
 * foreign sections and comments are preserved verbatim; the file shape stays
 * the documented two-level `dsh-desktop: { mode }` contract.
 * @module apps/desktop/main/mode
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Presentation modes; advanced is macOS/Windows only (rejected on Linux). */
export type DesktopMode = 'compatibility' | 'advanced';

/** Default mode when the settings document or section is absent. */
export const DEFAULT_MODE: DesktopMode = 'compatibility';

/** Settings document path inside a DSH home. */
export function settingsPath(home: string): string {
  return join(home, 'settings.yaml');
}

/** Read the committed mode; absent file/section/field yields the default. */
export function readMode(home: string): DesktopMode {
  const file = settingsPath(home);
  if (!existsSync(file)) return DEFAULT_MODE;
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (/^dsh-desktop:\s*$/.test(lines[index] ?? '')) {
      // Scan the indented block for the mode field.
      for (let inner = index + 1; inner < lines.length; inner += 1) {
        const line = lines[inner] ?? '';
        if (/^\S/.test(line)) break; // next top-level key
        const match = line.match(/^\s+mode:\s*(\S+)\s*$/);
        if (match !== null) {
          return match[1] === 'advanced' ? 'advanced' : 'compatibility';
        }
      }
      return DEFAULT_MODE;
    }
  }
  return DEFAULT_MODE;
}

/**
 * Commit a mode to the settings document, preserving foreign content.
 * Replaces the existing `mode` line inside the `dsh-desktop` block, inserts
 * one when the block exists without it, or appends the block otherwise.
 */
export function writeMode(home: string, mode: DesktopMode): void {
  const file = settingsPath(home);
  const content = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const lines = content.split('\n');
  const sectionIndex = lines.findIndex((line) => /^dsh-desktop:\s*$/.test(line));

  if (sectionIndex === -1) {
    const suffix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    writeFileSync(file, `${content}${suffix}dsh-desktop:\n  mode: ${mode}\n`);
    return;
  }

  for (let inner = sectionIndex + 1; inner <= lines.length; inner += 1) {
    const line = lines[inner];
    if (line === undefined || /^\S/.test(line)) {
      // Block ended without a mode field: insert directly under the header.
      lines.splice(sectionIndex + 1, 0, `  mode: ${mode}`);
      writeFileSync(file, `${lines.join('\n')}`);
      return;
    }
    if (/^\s+mode:\s*\S+\s*$/.test(line)) {
      lines[inner] = `  mode: ${mode}`;
      writeFileSync(file, `${lines.join('\n')}`);
      return;
    }
  }
}

/** Platforms where advanced presentation is supported. */
export function advancedSupported(platform: NodeJS.Platform): boolean {
  return platform === 'darwin' || platform === 'win32';
}
