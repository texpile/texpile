// An edit as TeX's reader counts lines: old lines from..oldTo became new lines from..newTo (1-based, an insertion
// has oldTo = from - 1).
export type LineEdit = { from: number; oldTo: number; newTo: number };

/** lines as the engine's reader splits a file: a final newline ends the last line rather than starting one */
export function linesOf(text: string): string[] {
	const lines = text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
	if (lines.length && lines[lines.length - 1] === '') lines.pop();
	return lines;
}

export function lineEdit(before: string[], after: string[]): LineEdit | null {
	let head = 0;
	while (head < before.length && head < after.length && before[head] === after[head]) head++;
	if (head === before.length && head === after.length) return null;
	let tail = 0;
	while (tail < before.length - head && tail < after.length - head && before[before.length - 1 - tail] === after[after.length - 1 - tail])
		tail++;
	return { from: head + 1, oldTo: before.length - tail, newTo: after.length - tail };
}
