// `#show figure.where(kind: table): set figure.caption(position: top)`, or the same rule for every figure
const TOP_RULE = /(?:\bshow\s+figure(?:\.where\(\s*kind:\s*(\w+)\s*\))?\s*:\s*)?\bset\s+figure\.caption\([^)]*\bposition:\s*top\b/g;

let read: { src: string; above: boolean } | null = null;

/** the document's own rule prints a table's caption over the table */
export function captionsAboveTables(src: string): boolean {
	if (read?.src !== src) {
		let above = false;
		for (const rule of src.matchAll(TOP_RULE)) above ||= !rule[1] || rule[1] === 'table';
		read = { src, above };
	}
	return read.above;
}
