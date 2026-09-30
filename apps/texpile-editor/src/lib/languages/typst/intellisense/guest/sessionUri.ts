// How a guest names a document that exists on the host's disk and nowhere on its own.
//
// The obvious choice - a file:// URI under some invented root - is the exact mistake this design
// exists to avoid. It LOOKS like a real path, so a URI that slips past the mapping resolves to
// something plausible and wrong on the host instead of failing, and the invented root has to be
// shaped differently per platform, which is its own bug farm. A scheme that is obviously not a
// filesystem path cannot be quietly mistaken for one: an unmapped URI reaches tinymist as
// `texpile-session:/...`, which it rejects out loud.
//
// Paths are manifest-relative and forward-slashed, matching every other path on the wire.

export const SESSION_SCHEME = 'texpile-session';

const PREFIX = `${SESSION_SCHEME}:/`;

/** The URI a guest addresses a manifest-relative path by. */
export function sessionUri(rel: string): string {
	const clean = rel.replace(/\\/g, '/').replace(/^\/+/, '');
	return PREFIX + clean.split('/').map(encodeURIComponent).join('/');
}

/** The manifest-relative path back out, or null when this URI is not one of ours. */
export function relFromSessionUri(uri: string): string | null {
	if (!uri.startsWith(PREFIX)) return null;
	const body = uri.slice(PREFIX.length);
	if (!body) return null;
	try {
		const rel = body.split('/').map(decodeURIComponent).join('/');
		// a mapped path must stay inside the project: `..` would let a crafted frame walk the
		// host's disk, and the host resolves these against a real root
		if (rel.split('/').some((seg) => seg === '..')) return null;
		return rel;
	} catch {
		return null; // malformed percent-encoding
	}
}

/** Keys whose string value is a document URI, across the LSP messages we relay (`target` is a
 *  DocumentLink's: the file a path in the source names). */
const URI_KEYS = new Set(['uri', 'targetUri', 'rootUri', 'newUri', 'oldUri', 'target']);

/**
 * Rewrite every document URI inside an arbitrary LSP payload, leaving the rest untouched.
 *
 * A structural walk rather than a per-message mapper on purpose: the relayed set is whatever the
 * editor's LSP extensions decide to ask for, and it grows without this file being touched. Missing
 * a URI is the failure that matters (a guest's go-to-definition silently landing on the wrong
 * file), so this errs toward rewriting anything shaped like one.
 */
export function mapUris<T>(value: T, map: (uri: string) => string | null): T {
	if (Array.isArray(value)) return value.map((v) => mapUris(v, map)) as unknown as T;
	if (!value || typeof value !== 'object') return value;
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		if (URI_KEYS.has(k) && typeof v === 'string') {
			const mapped = map(v);
			// an unmappable URI drops the KEY, not the message: a result that keeps a foreign
			// absolute path would point a guest at a path it cannot open, and silently
			if (mapped != null) out[k] = mapped;
		} else {
			out[k] = mapUris(v, map);
		}
	}
	return out as T;
}
