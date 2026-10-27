#!/bin/sh
# Puts a VNBox web release on the site: the engine and its root file system in vnbox/engine/,
# and its version in js/apps/vnbox.js. VNBox's update-site workflow runs this on each release.
# The release's zips are served from here because GitHub's release downloads send no CORS headers.
# usage: tools/update-vnbox.sh [tag]   (default: the latest release; needs gh)
set -eu
cd "$(dirname "$0")/.."
tag=${1:-$(gh release view -R blankiekun/VNBox --json tagName -q .tagName)}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
gh release download "$tag" -R blankiekun/VNBox -D "$tmp"
(cd "$tmp" && sha256sum -c --quiet SHA256SUMS)
rm -rf vnbox/engine
mkdir -p vnbox/engine
tar -xzf "$tmp/vnbox-web-$tag.tar.gz" -C vnbox/engine --strip-components=1
mv "$tmp"/*.zip vnbox/engine/
sed -i -E "s/^const ENGINE_VERSION = 'v[0-9.]+';/const ENGINE_VERSION = '$tag';/" js/apps/vnbox.js
grep -q "^const ENGINE_VERSION = '$tag';" js/apps/vnbox.js
