import type { FileKind } from '$lib/workspace/documentBuffer.svelte';

/** for .bib it is the reference editor against raw BibTeX, which only the host has */
export function hasViewToggle(path: string | null, kind: FileKind, guest: boolean): boolean {
	return !!path && (kind === 'tex' || kind === 'md' || kind === 'typ' || (kind === 'bib' && !guest));
}
