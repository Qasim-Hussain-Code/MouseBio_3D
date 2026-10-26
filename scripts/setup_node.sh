#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
version=22.23.4
archive="node-v${version}-linux-x64.tar.xz"
mkdir -p .tools
if [ ! -x .tools/node/bin/node ] || [ "$(.tools/node/bin/node --version)" != "v${version}" ]; then
  curl --fail --location --max-filesize 40000000 "https://nodejs.org/dist/v${version}/${archive}" -o ".tools/${archive}"
  curl --fail --location "https://nodejs.org/dist/v${version}/SHASUMS256.txt" -o .tools/SHASUMS256.txt
  (cd .tools && rg_line=$(grep " ${archive}$" SHASUMS256.txt) && printf '%s\n' "$rg_line" | sha256sum --check)
  mkdir -p .tools/node
  tar -xJf ".tools/${archive}" --strip-components=1 -C .tools/node
fi
export PATH="$PWD/.tools/node/bin:$PATH"
node --version
npm --version
du -sh .tools
