// The registries derived from the open document: its \label targets, its embedded \bibitem
// entries, and the merged citation list the editors resolve \cite against.
//
// All of it is recomputed from the source text on a debounce, with the AST parse running in a
// worker (latest-wins; a null result means superseded or failed, and the previous registries
// stay rather than blinking empty).
import { references, bibItemsToReferences, type BiblatexReference } from '$lib/workspace/citations';
import { labelStore, referenceStore } from '$lib/stores/editorStore';
import { extractDocRefsAsync } from '$lib/languages/latex/parser/labelsClient';

const DEBOUNCE_MS = 400;

export type DocRegistryDeps = {
	/** read LIVE at fire time, never closed over: a file switch blanks the buffer briefly and a
	 * stale closure would push that transient '' into the label/citation state */
	getSource(): string;
};

export class DocRegistries {
	/** \bibitem entries found in the current doc; .bib entries win on key clashes */
	bibitemRefs = $state<BiblatexReference[]>([]);
	private timer: ReturnType<typeof setTimeout> | undefined;

	constructor(private deps: DocRegistryDeps) {}

	/** the folder's .bib entries plus any \bibitem ones not already covered, so citations resolve
	 * in BOTH modes. The editor re-syncs this same merged list, so both writers must agree. */
	get merged(): BiblatexReference[] {
		const bib = references.current;
		if (!this.bibitemRefs.length) return bib;
		const seen = new Set(bib.map((r) => r.key));
		return [...bib, ...this.bibitemRefs.filter((r) => !seen.has(r.key))];
	}

	/** publish the merged list for the editors */
	publish(merged: BiblatexReference[]): void {
		referenceStore.current = merged;
	}

	/** (re-)arm the debounce; call from an effect that depends on the source text */
	schedule(): () => void {
		clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			const text = this.deps.getSource();
			void extractDocRefsAsync(text).then((refs) => {
				if (!refs) return;
				labelStore.current = refs.labels;
				this.bibitemRefs = bibItemsToReferences(refs.bibitems);
			});
		}, DEBOUNCE_MS);
		return () => clearTimeout(this.timer);
	}
}
