// The user's personal bibliography: entries kept once, insertable into any project. Backed by
// library.bib in the app's userData (electron/src/library.ts), reached through the
// window.texpileLibrary bridge. Loaded lazily on first use; the manager and picker dialogs both
// read this singleton. A failed load is retryable (error is cleared by a later successful load).
import { parseBibtex, type BiblatexReference } from '$lib/languages/bib/biblatex';

/** the bridge exists (desktop app); the browser dev server has no library */
export function libraryAvailable(): boolean {
	return typeof window !== 'undefined' && !!window.texpileLibrary;
}

class LibraryStore {
	/** null = not loaded yet; '' = loaded, empty (or bridge absent) */
	text = $state<string | null>(null);
	refs = $state<BiblatexReference[]>([]);
	error = $state<string | null>(null);

	async load(): Promise<void> {
		if (this.text !== null && !this.error) return;
		const bridge = window.texpileLibrary;
		if (!bridge) {
			this.text = '';
			return;
		}
		const res = await bridge.read();
		if (!res.ok || typeof res.text !== 'string') {
			this.error = res.error ?? 'could not read the library';
			this.text = '';
			return;
		}
		this.text = res.text;
		this.refs = parseBibtex(res.text);
		this.error = null;
	}

	/** replace the whole library; false when the write failed (error holds the reason) */
	async save(text: string): Promise<boolean> {
		const bridge = window.texpileLibrary;
		if (!bridge) return false;
		const res = await bridge.write(text);
		if (!res.ok) {
			this.error = res.error ?? 'could not save the library';
			return false;
		}
		this.text = text;
		this.refs = parseBibtex(text);
		this.error = null;
		return true;
	}
}

/**
 * The personal bibliography store singleton. The merged citation list for the completion
 * surfaces (project + library, deduped) lives in ./libraryRefs.
 */
export const libraryStore = new LibraryStore();
