import type * as Y from 'yjs';
import type { ManifestEntry } from './session';

/** files listed before that the manifest now says moved, each to where it is now */
export function manifestMoves(before: Iterable<string>, manifest: Y.Map<ManifestEntry>): [from: string, to: string][] {
	const moves: [string, string][] = [];
	for (const from of before) {
		const seen = new Set([from]);
		let entry = manifest.get(from);
		let to = from;
		while (entry?.gone && entry.movedTo && !seen.has(entry.movedTo)) {
			to = entry.movedTo;
			seen.add(to);
			entry = manifest.get(to);
		}
		if (to !== from && entry && !entry.gone) moves.push([from, to]);
	}
	return moves;
}
