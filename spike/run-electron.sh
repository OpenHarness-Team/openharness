#!/bin/sh
# Spike stage 2 runner: launch the spike Electron main with the repo's Electron.
set -e
cd "$(dirname "$0")/.."
exec apps/desktop/node_modules/.bin/electron spike/electron-main.mjs
