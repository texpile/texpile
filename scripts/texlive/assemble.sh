#!/usr/bin/env bash
# What goes up beside the platform archives already in <out>: the year's source checked against its checksum, TeX
# Live's licenses, SOURCE and SHA256SUMS. Then the hashes the app pins, to $GITHUB_STEP_SUMMARY on CI.
#   scripts/texlive/assemble.sh <out> <version>
# <version>: <year>-r<revision>, as pick-mirror.sh prints it. <out> holds texlive-x86_64-linux.tar.xz.
set -euo pipefail
out="$(cd "$1" && pwd)" version="$2"
root="$(cd "$(dirname "$0")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
# GNU coreutils on Linux, shasum on macOS
sha() { if command -v "sha$1sum" > /dev/null; then "sha$1sum" "${@:2}"; else shasum -a "$1" "${@:2}"; fi; }

source="$(jq -r .source "$root/vendor/texlive.json")"
name="$(basename "$source")"
url=
for attempt in 1 2 3 4 5; do
	if url="$(curl -fsSL -o "$out/$name" -w '%{url_effective}' "$source")"; then break; fi
	url=
done
[ -n "$url" ] || { echo "no mirror served $source" >&2; exit 1; }
(cd "$out" && curl -fsSL --retry 3 "$url.sha512" | sha 512 -c -)

tar -xJf "$out/texlive-x86_64-linux.tar.xz" -C "$work" texlive/LICENSE.TL texlive/LICENSE.CTAN
cp "$work/texlive/LICENSE.TL" "$work/texlive/LICENSE.CTAN" "$out/"
printf 'TeX Live %s, revision %s of its repository, installed with its own install-tl and tlmgr.\nThe Windows programs TeX Live leaves unsigned are signed by Texpile LLC. Nothing else is changed.\nThe source of the programs is %s. The Subversion repository of TeX Live holds every revision.\n' \
	"${version%%-r*}" "${version##*-r}" "$name" > "$out/SOURCE"
(cd "$out" && sha 256 texlive-* > SHA256SUMS && cat SHA256SUMS)

{
	echo 'For `electron/src/texlive/texliveRelease.ts`:'
	echo '```ts'
	echo "export const TEXLIVE_VERSION = '$version';"
	echo 'const SHA256_BY_PLATFORM: Record<string, string> = {'
	grep -v -- '-source\.tar\.xz$' "$out/SHA256SUMS" | while read -r hash file; do
		platform="${file#texlive-}"
		platform="${platform%.zip}"
		platform="${platform%.tar.xz}"
		echo "	'$platform': '$hash',"
	done
	echo '};'
	echo '```'
} >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
