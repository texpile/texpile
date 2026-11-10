#!/usr/bin/env bash
# The installed tree as <out>/texlive-<platform>.tar.xz, the folder itself at the top of the archive.
#   scripts/texlive/pack.sh <dir> <platform> <out>
set -euo pipefail
dir="$(cd "$1" && pwd)" platform="$2"
mkdir -p "$3"
out="$(cd "$3" && pwd)"
# tlmgr's copy of the mirror's package database; it fetches a fresh one on its next run
rm -f "$dir"/tlpkg/texlive.tlpdb.main.*
tar -cJf "$out/texlive-$platform.tar.xz" -C "$(dirname "$dir")" "$(basename "$dir")"
ls -l "$out/texlive-$platform.tar.xz"
