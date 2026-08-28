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
	onRecompile?: () => void | Promise<void>;
};
