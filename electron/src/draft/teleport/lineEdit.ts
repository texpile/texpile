// An edit as TeX's reader counts lines: old lines from..oldTo became new lines from..newTo (1-based, an insertion
// has oldTo = from - 1).
export type LineEdit = { from: number; oldTo: number; newTo: number };

/** lines as the engine's reader splits a file: at \n, \r\n or a lone \r, and a final one ends the last line rather than
 * starting one */
export function linesOf(text: string): string[] {
	const lines = text.split(/\r\n|\n|\r/);
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

// an old line past `after` moves by `by`. A list goes in order, the last change first, so each reads old numbers
export type LineShift = { after: number; by: number };

// changed lines past this count move as one span
const MAX_CHANGED = 400;

/** where the lines two texts share move to. One edit can hold several changes (a cut run's and the next keystroke's),
 * and a line between two of them moves by the first alone */
export function lineShifts(before: string[], after: string[]): LineShift[] {
	const edit = lineEdit(before, after);
	if (!edit) return [];
	const base = edit.from - 1;
	const a = before.slice(base, edit.oldTo);
	const b = after.slice(base, edit.newTo);
	const kept = sharedLines(a, b);
	if (!kept) return edit.newTo === edit.oldTo ? [] : [{ after: edit.oldTo, by: edit.newTo - edit.oldTo }];
	const out: LineShift[] = [];
	let [i, j] = [0, 0];
	for (const [x, y] of [...kept, [a.length, b.length]]) {
		const by = y - j - (x - i);
		if (by) out.push({ after: base + x, by });
		[i, j] = [x + 1, y + 1];
	}
	return out.reverse();
}

// Myers' greedy diff: the pairs of equal lines, in order, or null past MAX_CHANGED
function sharedLines(a: string[], b: string[]): [number, number][] | null {
	const [n, m] = [a.length, b.length];
	const max = Math.min(n + m, MAX_CHANGED);
	const off = max + 1;
	const v = new Int32Array(2 * max + 3);
	const trace: Int32Array[] = [];
	for (let d = 0; d <= max; d++) {
		trace.push(v.slice());
		for (let k = -d; k <= d; k += 2) {
			let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
			let y = x - k;
			while (x < n && y < m && a[x] === b[y]) [x, y] = [x + 1, y + 1];
			v[off + k] = x;
			if (x >= n && y >= m) return pairsOf(trace, n, m, off);
		}
	}
	return null;
}

function pairsOf(trace: Int32Array[], n: number, m: number, off: number): [number, number][] {
	const pairs: [number, number][] = [];
	let [x, y] = [n, m];
	for (let d = trace.length - 1; d >= 0; d--) {
		const v = trace[d];
		const k = x - y;
		const prevK = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? k + 1 : k - 1;
		const prevX = d ? v[off + prevK] : 0;
		const prevY = d ? prevX - prevK : 0;
		while (x > prevX && y > prevY) {
			[x, y] = [x - 1, y - 1];
			pairs.push([x, y]);
		}
		[x, y] = [prevX, prevY];
	}
	return pairs.reverse();
}
