#!/usr/bin/env bash
# Publish the corpus on the server: pull, validate + build into a new release, switch `current` atomically.
# On any validation error the build exits non-zero and the live site keeps serving the previous release.
# Layout: $APP_DIR/repo (git clone), $APP_DIR/releases/<timestamp>, $APP_DIR/current -> releases/<timestamp>
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/atl}"
cd "$APP_DIR/repo"
git pull --ff-only
TS="$(date +%Y%m%d-%H%M%S)"
python3 tools/build.py --out "$APP_DIR/releases/$TS"
ln -sfn "releases/$TS" "$APP_DIR/current.tmp"
mv -Tf "$APP_DIR/current.tmp" "$APP_DIR/current"
# keep the five newest releases
ls -1dt "$APP_DIR"/releases/* | tail -n +6 | xargs -r rm -rf
echo "Published release $TS"
