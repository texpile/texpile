// The merged citation list for the completion surfaces (@ picker, \cite completion, chips):
// project refs first, then library refs whose key isn't already present, so the library backs
// citations without ever shadowing a project entry. Pure function - callers re-run it
// reactively (it reads libraryStore.refs, a $state field, so $derived tracks it).
import type { BiblatexReference } from '$lib/languages/bib/biblatex';
import { libraryStore } from './libraryStore.svelte';

export function citationRefsWithLibrary(projectRefs: BiblatexReference[]): BiblatexReference[] {
	const seen = new Set(projectRefs.map((r) => r.key));
	return [...projectRefs, ...libraryStore.refs.filter((r) => !seen.has(r.key))];
}
