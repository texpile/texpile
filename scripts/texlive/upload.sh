#!/usr/bin/env bash
# <out> to dl.texpile.com/vendor/texlive/<version>/. A published version is never replaced: SHA256SUMS goes up last,
# and its presence stops a second upload.
#   scripts/texlive/upload.sh <out> <version>
# Reads CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID; BUCKET defaults to texpile-releases.
set -euo pipefail
out="$(cd "$1" && pwd)" version="$2"
bucket="${BUCKET:-texpile-releases}"
prefix="vendor/texlive/$version"
if npx wrangler@4 r2 object get "$bucket/$prefix/SHA256SUMS" --file "$(mktemp)" --remote > /dev/null 2>&1; then
	echo "$prefix is already published; a new build of it would break the hashes Texpile pins" >&2
	exit 1
fi
put() { npx wrangler@4 r2 object put "$bucket/$prefix/$1" --file "$out/$1" --remote --content-type "$2"; }
for file in "$out"/texlive-*; do
	name="$(basename "$file")"
	case "$name" in
		*.zip) put "$name" application/zip ;;
		*) put "$name" application/x-xz ;;
	esac
done
put LICENSE.TL 'text/plain; charset=utf-8'
put LICENSE.CTAN 'text/plain; charset=utf-8'
put SOURCE 'text/plain; charset=utf-8'
put SHA256SUMS 'text/plain; charset=utf-8'
