import { writable } from 'svelte/store';

export interface TocItem {
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
}

/** Headings of the current document, kept in sync by the TOC plugin (createTocPlugin). Visual mode. */
export const tocStore = writable<TocItem[]>([]);

/** Headings parsed from the raw .tex source; `pos` is a CodeMirror char offset. Source mode. */
export const sourceTocStore = writable<TocItem[]>([]);
