import { fileIdentityKey } from '../identity/fileUris';

const indexes = new Set<{ clear(): void }>();

/** what one indexer reads from a file, once per text; `keyOf` says when its context is the same */
export class FileIndex<T, C = undefined> {
	private readonly entries = new Map<string, { text: string; context: string; value: T }>();

	constructor(
		private readonly compute: (path: string, text: string, context: C) => T,
		private readonly keyOf: (context: C) => string = () => ''
	) {
		indexes.add(this);
	}

	get(path: string, text: string, context?: C): T {
		const key = fileIdentityKey(path);
		const contextKey = this.keyOf(context as C);
		const found = this.entries.get(key);
		if (found && found.text === text && found.context === contextKey) return found.value;
		const value = this.compute(path, text, context as C);
		this.entries.set(key, { text, context: contextKey, value });
		return value;
	}

	clear(): void {
		this.entries.clear();
	}
}

export function clearFileIndexes(): void {
	for (const index of indexes) index.clear();
}
