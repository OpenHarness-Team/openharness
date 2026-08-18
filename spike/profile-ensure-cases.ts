/**
 * Assertion cases for ensureDesktopProfile; executed by profile-ensure.mjs
 * through the fork's tsx with a temp DSH home as argv[2].
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DESKTOP_PROFILE_NAME,
  INSTALLATION_OWNED_BUNDLES,
  ensureDesktopProfile,
  type freshDesktopManifest,
  isInstallationOwned,
} from '../apps/desktop/src/main/profile.ts';

const home = process.argv[2];
if (home === undefined) throw new Error('usage: profile-ensure-cases.ts <temp-home>');

let failures = 0;
const check = (label: string, condition: boolean): void => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`);
  if (!condition) failures += 1;
};

// Case 1: first-use creation
const first = ensureDesktopProfile(home);
check('creates the profile on first use', first.created && !first.userOwned);
check(
  'profile dir under <home>/profiles/desktop',
  first.dir === join(home, 'profiles', DESKTOP_PROFILE_NAME),
);
const created = JSON.parse(readFileSync(join(first.dir, 'package.json'), 'utf8')) as ReturnType<
  typeof freshDesktopManifest
>;
check(
  'manifest bundles are installation-owned',
  isInstallationOwned(created.dsh?.profile?.bundles),
);
check(
  'manifest bundles match the owned tuple',
  JSON.stringify(created.dsh?.profile?.bundles) === JSON.stringify([...INSTALLATION_OWNED_BUNDLES]),
);

// Case 2: idempotent for installation-owned manifests
const second = ensureDesktopProfile(home);
check('second call does not recreate', !second.created && !second.userOwned);

// Case 3: user-modified bundle list is preserved untouched
const userManifest = {
  ...created,
  dsh: { profile: { bundles: [...INSTALLATION_OWNED_BUNDLES, 'third-party-bundle'] } },
};
writeFileSync(join(first.dir, 'package.json'), JSON.stringify(userManifest, undefined, 2));
const third = ensureDesktopProfile(home);
check('user-owned manifest detected', !third.created && third.userOwned);
const preserved = JSON.parse(
  readFileSync(join(first.dir, 'package.json'), 'utf8'),
) as typeof userManifest;
check(
  'third-party bundle order preserved',
  preserved.dsh?.profile?.bundles?.[2] === 'third-party-bundle',
);

// Case 4: corrupt manifest fails loud
const corruptHome = join(home, 'corrupt-root');
mkdirSync(join(corruptHome, 'profiles', DESKTOP_PROFILE_NAME), { recursive: true });
writeFileSync(join(corruptHome, 'profiles', DESKTOP_PROFILE_NAME, 'package.json'), '{not json');
let threw = false;
try {
  ensureDesktopProfile(corruptHome);
} catch {
  threw = true;
}
check('corrupt manifest fails loud', threw);

console.log(failures === 0 ? 'PROFILE_ENSURE_OK' : `PROFILE_ENSURE_FAIL count=${failures}`);
process.exit(failures === 0 ? 0 : 1);
