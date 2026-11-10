#!/usr/bin/env bash
# TeX Live from the picked mirror into <dir>, with TeX Live's own install-tl and tlmgr: scheme-basic, then the list
# in vendor/texlive-packages.txt, no docs or sources. Stops when the mirror moved on from <tlpdb> during the install.
#   scripts/texlive/install.sh <mirror> <platform> <dir> [<tlpdb>]
# <mirror>, <tlpdb>: the lines pick-mirror.sh prints; without <tlpdb>, the database the mirror serves when it starts.
# <platform>: x86_64-linux, aarch64-linux or universal-darwin.
set -euo pipefail
mirror="$1" platform="$2"
mkdir -p "$3"
dir="$(cd "$3" && pwd)"
tlpdb="${4:-$(curl -fsSL --retry 3 "$mirror/tlpkg/texlive.tlpdb.sha512")}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

same() {
	[ "$(curl -fsSL --retry 3 "$mirror/tlpkg/texlive.tlpdb.sha512")" = "$tlpdb" ] \
		|| { echo "$mirror moved to a newer revision during the install; run it again" >&2; exit 1; }
}
same
curl -fsSL --retry 3 "$mirror/install-tl-unx.tar.gz" | tar -xz -C "$work" --strip-components=1
perl "$work/install-tl" -no-interaction -portable -scheme scheme-basic -no-doc-install -no-src-install \
	-texdir "$dir" -repository "$mirror"
# an absolute path: tlmgr finds its tree from where it was run
tlmgr="$dir/bin/$platform/tlmgr"
"$tlmgr" --repository "$mirror" install $(cat "$root/vendor/texlive-packages.txt")
"$tlmgr" option repository "$(jq -r .repository "$root/vendor/texlive.json")"
same
