import type { ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
import { pathKey } from '$lib/workspace/fileSystem';

/** well below the tab cap: a parsed paper is tens of thousands of nodes, not a string */
const MAX_CACHED_DOCUMENTS = 8;

type CacheEntry = { parsed: ParsedLatexFile; source: string };

class VisualDocCache {
	private entries = new Map<string, CacheEntry>();

	get(path: string, source: string): ParsedLatexFile | null {
		const key = pathKey(path);
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
		const key = pathKey(path);
		this.entries.delete(key);
		this.entries.set(key, { parsed, source });
		while (this.entries.size > MAX_CACHED_DOCUMENTS) {
			const oldest = this.entries.keys().next();
			if (oldest.done) return;
			this.entries.delete(oldest.value);
		}
	}

	forget(path: string): void {
		const prefix = pathKey(path) + '/';
		for (const key of [...this.entries.keys()]) {
			if (key === pathKey(path) || key.startsWith(prefix)) this.entries.delete(key);
		}
	}

	rename(from: string, to: string): void {
		const fromKey = pathKey(from);
		const prefix = fromKey + '/';
		for (const [key, entry] of [...this.entries]) {
			if (key !== fromKey && !key.startsWith(prefix)) continue;
			this.entries.delete(key);
			this.entries.set(pathKey(to) + key.slice(fromKey.length), entry);
		}
	}

	clear(): void {
		this.entries.clear();
	}
}

export const visualDocCache = new VisualDocCache();
