import type { FileKind } from '$lib/workspace/documentBuffer.svelte';
import { isTikzFile } from '$lib/draw/host/tikzFile/tikzFile';

/** for .bib it is the reference editor against raw BibTeX, which only the host has; for .tikz the figure editor */
export function hasViewToggle(path: string | null, kind: FileKind, guest: boolean): boolean {
	return (
		!!path && (kind === 'tex' || kind === 'md' || kind === 'typ' || (kind === 'bib' && !guest) || (kind === 'text' && isTikzFile(path)))
	);
}
