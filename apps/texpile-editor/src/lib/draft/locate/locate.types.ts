/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PageRecord } from '../geometry/geometry.types';

// colSep/blSkip/parSkip: engine registers from the manifest (0 = older bridge; consumers
// fall back to the LaTeX-default guesses they replaced)
export type PaperMetrics = {
	w: number;
	h: number;
	colW: number;
	textW: number;
	fs: number;
	mx: number;
	my: number;
	colSep: number;
	blSkip: number;
	parSkip: number;
	topSkip: number;
	// files whose paragraphs the compile stamped, in id order; a line record's `sf` indexes
	// this 1-based. Empty when the compile recorded no source lines (older bridge).
	srcFiles: string[];
};

export type Cal = {
	pageNo: number;
	b1: number;
	bk: number;
	medGap: number;
	paraLeft: number;
	W: number;
	colL: number;
	colR: number;
	// 0-based index of the page column this band sits in, from the compile's own column
	// records; absent when the page recorded none
	col?: number;
	// found by the fuzzy inverse map (right glyphs, line count off by one, e.g. the daemon's
	// \noindent vs an indented page paragraph): good enough for a PROVISIONAL patch that a
	// full compile reconciles, never for an exact one
	approx?: boolean;
	// approx SOLELY because the band's spacing is glue-stretched/context-adjusted while its
	// glyphs and offsets matched exactly: an engine page-break certificate can restore exact
	approxStretch?: boolean;
	// the page paragraph is indented (TeX indents mid-section paragraphs; the daemon's box is
	// \noindent): re-typesets of this paragraph must carry the \parindent prefix to reproduce
	// the same breaks
	indent?: boolean;
	// the winning variant's font prefix (\fontsize measured from the page's own records: a
	// narrowed environment like an abstract runs under another size/leading): re-typesets
	// must carry it to reproduce the band's metrics
	pre?: string;
	// the paragraph STRADDLES a column break: b1/bk/colL/colR describe the FIRST (reading
	// order) part; `spill` is the continuation at the top of the next column -- or, when
	// pageNo is set, at the top of a column on the NEXT PAGE. Split patches are always
	// provisional.
	spill?: { b1: number; bk: number; colL: number; colR: number; paraLeft: number; pageNo?: number };
};

export type CalBail = { bail: string; invisible?: boolean };

// Reactive component state reaches the locate tiers through accessors, so a captured
// context never goes stale when the compile replaces pages/paper.
export type LocateContext = {
	pdfPath(): string;
	paper(): PaperMetrics;
	pageNumbers(): number[];
	pageCount(): number;
	pageRecords(n: number): PageRecord[];
	rtlPage(n: number): boolean;
	synctex(body: Record<string, unknown>): Promise<any>;
	typesetParagraph(body: { text: string; hsize?: number }): Promise<any>;
	emit(kind: string, detail?: unknown): void;
};
