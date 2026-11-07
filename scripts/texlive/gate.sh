#!/usr/bin/env bash
# Live mode's gate on every fixture, with the TeX Live in <dir> first on PATH. Needs the repo's pnpm install.
#   scripts/texlive/gate.sh <dir> <platform>
set -euo pipefail
bin="$(cd "$1/bin/$2" && pwd)"
export PATH="$bin:$PATH"
cd "$(dirname "$0")/../../apps/texpile-editor"
for fixture in tests/live/fixtures/*/; do
	# ctex comes from tlmgr when a document first loads it
	[ "$(basename "$fixture")" = cjk ] && continue
	node tests/live/teleport/edits.mjs "$fixture" main.tex --edits=6 --seed=1
done
