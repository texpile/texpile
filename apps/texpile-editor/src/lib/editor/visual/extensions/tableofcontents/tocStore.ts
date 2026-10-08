import { box } from '$lib/runes/box.svelte';

export type TocItem = {
	level: number;
	text: string;
	pos: number;
	/** entry flavor; plain headings omit it */
	kind?: 'heading' | 'figure' | 'table' | 'frame';
	/** "3.2", "A.1", float counter, from outline numbering */
	number?: string;
	/** 1-based line, for jumps into files other than the open buffer */
	line?: number;
	/** absolute path when the entry was merged in from an \input fragment */
	file?: string;
};

/** which headings the explorer's Contents lists: the visual editor's, the source text's, none for
 * a file without any (a picture, a .bib), or none because no file is open */
export type TocList = 'visual' | 'source' | 'none' | 'closed';

/** Headings of the current document, kept in sync by the TOC plugin (createTocPlugin). Visual mode. */
export const tocStore = box<TocItem[]>([]);

/** visual mode's list for a file in a paper: the whole paper's headings, the open file's at its editor's positions */
export const visualProjectTocStore = box<TocItem[] | null>(null);

/** Headings parsed from the raw .tex source; `pos` is a CodeMirror char offset. Source mode. */
export const sourceTocStore = box<TocItem[]>([]);

/** the caret in the showing list's coordinates: a PM position in visual mode, a char offset in source mode */
export const tocCaretStore = box<number | null>(null);

/** the section the caret is in: the last heading of this buffer at or before it */
export function activeTocIndex(items: TocItem[], caret: number | null): number {
	if (caret == null) return -1;
	let hit = -1;
	for (let i = 0; i < items.length; i++) {
		const it = items[i];
		if (!it.file && (!it.kind || it.kind === 'heading' || it.kind === 'frame') && it.pos <= caret) hit = i;
	}
	return hit;
}
