import type { PageRecord } from '../geometry/geometry.types';
import type { FlowStep } from './glueShift';

export type Patch = {
	top: number;
	dropTop: number;
	dropBottom: number;
	delta: number;
	paraLeft: number;
	colL: number;
	colR: number;
	// the page column this patch is in, as the compile recorded it. Absent when the page
	// recorded no columns (multicol, a float page), and the x-window decides instead.
	col?: number;
	newRecs: PageRecord[];
	// shifted records landing past this y are dropped on THIS page (they are being
	// re-drawn at the top of the next page by the overflow split)
	clipBottom?: number;
	// records BELOW this y are outside the contiguous content flow (the isolated
	// page-number footer): never shift, clip, or move them
	flowBottom?: number;
	// piecewise below-band shift from the page's real glue (stretched pages): content
	// past each step's y shifts by its dy instead of the constant delta
	flowSteps?: FlowStep[];
	// the same for content ABOVE the band, and only ever from a certificate: the engine
	// respaces a whole column, so a band that grows pushes the rows over it up as surely as
	// the ones under it down. Content above the first step does not move (the default dy is
	// 0), which is what leaves a float pinned at the column top where the engine put it.
	aboveSteps?: FlowStep[];
	// the patch's CLAIM about the content below the band (rows sampled at patch time,
	// y already shifted by delta): verifyPatches grades it against the fresh compile --
	// a row that lands elsewhere means the live render put the column/page break in the
	// wrong place, the divergence class the band rows alone can't see
	flowPred?: { y: number; cs: number[] }[];
};

export type PatchReq = {
	file: string;
	line: number;
	endLine?: number;
	text: string;
	orig: string;
	listItem?: boolean;
	transient?: boolean;
	floatInner?: boolean;
	// the edit changed the paragraph's SET of TeX commands: a command can carry
	// semantics invisible to glyph geometry, so the patch may render but never
	// claim exact -- the reconcile certifies (undetected drift beats no one)
	cmdChanged?: boolean;
	// interior-tier edit (text inside unchanged structure): renders, never adopts, always reconciles
	interiorEdit?: boolean;
	onRecompile?: () => void | Promise<void>;
	/** advance the patch baseline WITHOUT saving or compiling. Used when the patch produced the
	 *  page's new records itself: baseline and record store must move in the SAME tick, or the
	 *  next edit diffs its `orig` against a page that already shows the newer text. */
	onBaseline?: () => void;
};
