#!/usr/bin/env bash
# The mirror every platform's TeX Live build installs from, the package database it serves, and the version that
# makes: <year>-r<revision>-<lists>, the last part the start of the package lists' SHA-256. Prints mirror=, tlpdb= and
# version= lines, to $GITHUB_OUTPUT on CI.
#   scripts/texlive/pick-mirror.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
year="$(jq -r .year "$root/vendor/texlive.json")"
repository="$(jq -r .repository "$root/vendor/texlive.json")"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
# GNU coreutils on Linux, shasum on macOS
sha() { if command -v "sha$1sum" > /dev/null; then "sha$1sum" "${@:2}"; else shasum -a "$1" "${@:2}"; fi; }

# mirror.ctan.org can send a request to a mirror whose certificate chain curl refuses; each try is a new pick
mirror=
for attempt in 1 2 3 4 5; do
	if url="$(curl -fsSL -o /dev/null -w '%{url_effective}' "$repository/tlpkg/texlive.tlpdb.sha512")"; then
		mirror="${url%/tlpkg/texlive.tlpdb.sha512}"
		break
	fi
done
[ -n "$mirror" ] || { echo "no mirror of $repository answered" >&2; exit 1; }

tlpdb="$(curl -fsSL --retry 3 "$mirror/tlpkg/texlive.tlpdb.sha512")"
curl -fsSL --retry 3 "$mirror/tlpkg/texlive.tlpdb.xz" | xz -dc > "$work/texlive.tlpdb"
[ "$(sha 512 "$work/texlive.tlpdb" | cut -d' ' -f1)" = "${tlpdb%% *}" ] || { echo "$mirror serves a package database that fails its checksum" >&2; exit 1; }
config="$(awk '/^name 00texlive.config$/,/^$/' "$work/texlive.tlpdb")"
release="$(echo "$config" | sed -n 's|^depend release/||p')"
revision="$(echo "$config" | sed -n 's|^depend revision/||p')"
[ "$release" = "$year" ] || { echo "$repository serves TeX Live $release and the pin asks for $year" >&2; exit 1; }
# a list changed at the same revision is a new build, and a published version is never replaced
lists="$(cat "$root/vendor/texlive-packages.txt" "$root/vendor/texlive-packages-windows.txt" | sha 256 | cut -c1-6)"

out="${GITHUB_OUTPUT:-/dev/stdout}"
{
	echo "mirror=$mirror"
	echo "tlpdb=$tlpdb"
	echo "version=$year-r$revision-$lists"
} >> "$out"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "Installing TeX Live $year, revision $revision, from $mirror" >> "$GITHUB_STEP_SUMMARY"; fi
