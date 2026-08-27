// Insert citations from the personal library: pick entries (LibraryPickerDialog), land the
// picked ones in the bibliography the MAIN file declares, and put the citation at the caret.
// The landing is the shared insertBibliographyEntries (same one the Zotero flow uses); here we
// only turn picked keys into bib text from the library store, preferring each entry's verbatim
// raw so inside-entry formatting round-trips exactly as the user saved it.
import { libraryStore } from './libraryStore.svelte';
import { insertBibliographyEntries, type CitationInsertDeps } from '$lib/workspace/insertBibliography';
import { referencesToBib, type BiblatexReference } from '$lib/languages/bib/biblatex';

/** the picked entries as one bib text: raw where the store has it, pretty-printed otherwise */
export function libraryEntriesToBib(keys: string[], refs: BiblatexReference[]): string {
	const byKey = new Map(refs.map((r) => [r.key, r]));
	const chunks: string[] = [];
	for (const key of keys) {
		const ref = byKey.get(key);
		if (!ref) continue;
		chunks.push((ref.raw ?? referencesToBib([ref])).trim());
	}
	return chunks.length ? chunks.join('\n\n') + '\n' : '';
}

export async function insertFromLibrary(keys: string[], deps: CitationInsertDeps): Promise<void> {
	if (!keys.length) return;
	await libraryStore.load();
	const bib = libraryEntriesToBib(keys, libraryStore.refs);
	if (!bib.trim()) return; // stale-store guard: the picker only offers keys the store has
	await insertBibliographyEntries(bib, keys, deps);
}
