import type { ParsedLatexFile } from '$lib/workspace/latexRoundtrip';

/** well below the tab cap: a parsed paper is tens of thousands of nodes, not a string */
const MAX_CACHED_DOCUMENTS = 8;

type CacheEntry = { parsed: ParsedLatexFile; source: string };

function keyOf(path: string): string {
	return path.replace(/\\/g, '/').toLowerCase();
}

class VisualDocCache {
	private entries = new Map<string, CacheEntry>();

	get(path: string, source: string): ParsedLatexFile | null {
		const key = keyOf(path);
		const hit = this.entries.get(key);
		if (!hit) return null;
		if (hit.source !== source) {
			this.entries.delete(key);
			return null;
		}
		this.entries.delete(key);
		this.entries.set(key, hit);
		return hit.parsed;
	}

	set(path: string, source: string, parsed: ParsedLatexFile): void {
		const key = keyOf(path);
		this.entries.delete(key);
		this.entries.set(key, { parsed, source });
		while (this.entries.size > MAX_CACHED_DOCUMENTS) {
			const oldest = this.entries.keys().next();
			if (oldest.done) return;
			this.entries.delete(oldest.value);
		}
	}

	forget(path: string): void {
		const prefix = keyOf(path) + '/';
		for (const key of [...this.entries.keys()]) {
			if (key === keyOf(path) || key.startsWith(prefix)) this.entries.delete(key);
		}
	}

	rename(from: string, to: string): void {
		const fromKey = keyOf(from);
		const prefix = fromKey + '/';
		for (const [key, entry] of [...this.entries]) {
			if (key !== fromKey && !key.startsWith(prefix)) continue;
			this.entries.delete(key);
			this.entries.set(keyOf(to) + key.slice(fromKey.length), entry);
		}
	}

	clear(): void {
		this.entries.clear();
	}
}

export const visualDocCache = new VisualDocCache();
