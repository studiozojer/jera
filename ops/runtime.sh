#!/bin/bash
# Isolated Node runtime: do not change the Node used by other VPS services.
set -euo pipefail
cd /opt/jera-snapback
version=24.11.0
if [ -x runtime/bin/node ] && [ "$(runtime/bin/node --version)" = "v$version" ]; then exit 0; fi
test "$(uname -m)" = x86_64
runtime_tmp=$(mktemp -d)
trap 'rm -rf "$runtime_tmp"' EXIT
archive="node-v$version-linux-x64.tar.xz"
curl --fail --silent --show-error "https://nodejs.org/dist/v$version/$archive" -o "$runtime_tmp/$archive"
curl --fail --silent --show-error "https://nodejs.org/dist/v$version/SHASUMS256.txt" -o "$runtime_tmp/SHASUMS256.txt"
(cd "$runtime_tmp"; awk -v file="$archive" '$2 == file { print }' SHASUMS256.txt | sha256sum --check --strict)
mkdir "$runtime_tmp/unpacked"
tar -xf "$runtime_tmp/$archive" -C "$runtime_tmp/unpacked" --strip-components=1
test ! -e runtime || { echo 'Existing runtime differs; upgrade it explicitly after backup.' >&2; exit 1; }
mv "$runtime_tmp/unpacked" runtime
