// The page geometry a compile reports.
export type PaperMetrics = {
	w: number;
	h: number;
	// TeX's 1in reference point, moved by the document's \hoffset/\voffset
	mx: number;
	my: number;
	// files whose paragraphs the engine stamped, in id order; a line record's `sf` indexes this 1-based
	srcFiles: string[];
};
