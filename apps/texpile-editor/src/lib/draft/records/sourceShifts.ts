export type SourceShift = { sf: number; after: number; by: number };

/** a page's line records with their source lines moved, one shift after the other; null when none moved */
export function shiftSourceLines(records: string, shifts: SourceShift[]): string | null {
	if (!records.includes('"s":')) return null;
	let moved = false;
	const lines = records.split('\n').map((line) => {
		if (!line.startsWith('{"t":"pl"')) return line;
		const rec = JSON.parse(line);
		if (rec.s === undefined) return line;
		const was = rec.s;
		for (const { sf, after, by } of shifts) if ((rec.sf ?? 0) === sf && rec.s > after) rec.s += by;
		if (rec.s === was) return line;
		moved = true;
		return JSON.stringify(rec);
	});
	return moved ? lines.join('\n') : null;
}
