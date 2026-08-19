/**
 * Assertion cases for the `dsh-desktop.mode` settings plumbing
 * (apps/desktop/src/main/mode.ts); executed by mode-smoke.mjs through the
 * fork's tsx with a temp DSH home as argv[2].
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  advancedSupported,
  readMode,
  settingsPath,
  writeMode,
} from '../apps/desktop/src/main/mode.ts';

const home = process.argv[2];
if (home === undefined) throw new Error('usage: mode-cases.ts <temp-home>');

let failures = 0;
const check = (label: string, condition: boolean): void => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`);
  if (!condition) failures += 1;
};

const file = settingsPath(home);
const readRaw = (): string => readFileSync(file, 'utf8');

// Case 1: absent file defaults to compatibility
check('absent settings.yaml -> compatibility', readMode(home) === 'compatibility');

// Case 2: writeMode creates the section on an empty home
writeMode(home, 'advanced');
check('writeMode creates the section', readMode(home) === 'advanced');
check('created document has the desktop block', readRaw().includes('dsh-desktop:'));

// Case 3: writeMode replaces an existing mode line
writeMode(home, 'compatibility');
check('writeMode replaces mode in place', readMode(home) === 'compatibility');

// Case 4: foreign sections are preserved
writeFileSync(
  file,
  'other-namespace:\n  keep: true\ndsh-desktop:\n  mode: compatibility\ntrailing:\n  keep: 1\n',
);
writeMode(home, 'advanced');
const preserved = readRaw();
check(
  'foreign sections preserved',
  preserved.includes('other-namespace:') &&
    preserved.includes('trailing:') &&
    preserved.includes('keep: true'),
);
check('mode updated inside existing block', readMode(home) === 'advanced');

// Case 5: block without a mode field gets one inserted
writeFileSync(file, 'dsh-desktop:\n  other: x\n');
writeMode(home, 'advanced');
check('mode inserted into existing block', readMode(home) === 'advanced');

// Case 6: platform support matrix
check('advanced supported on darwin', advancedSupported('darwin'));
check('advanced supported on win32', advancedSupported('win32'));
check('advanced rejected on linux', !advancedSupported('linux'));

console.log(failures === 0 ? 'MODE_SMOKE_OK' : `MODE_SMOKE_FAIL count=${failures}`);
process.exit(failures === 0 ? 0 : 1);
