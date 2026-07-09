import { writable } from 'svelte/store';

export interface TocItem {
	level: number;
	text: string;
	pos: number;
}

/** Headings of the current document, kept in sync by the TOC plugin (createTocPlugin). Visual mode. */
export const tocStore = writable<TocItem[]>([]);

/** Headings parsed from the raw .tex source; `pos` is a CodeMirror char offset. Source mode. */
export const sourceTocStore = writable<TocItem[]>([]);
