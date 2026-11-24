import type { ChangedRange } from '@lezer/common';

// a line the edits left is found again within this many lines on either side
const RESYNC_LINES = 64;

function lineEnd(text: string, from: number, end: number): number {
	const at = text.indexOf('\n', from);
	return at < 0 || at >= end ? end : at + 1;
}

function sameLine(old: string, a: number, aEnd: number, text: string, b: number, bEnd: number): boolean {
	return aEnd - a === bEnd - b && old.startsWith(text.slice(b, bEnd), a);
}

/** the line starts from `from` on, up to `count` of them */
function linesFrom(text: string, from: number, end: number, count: number): number[] {
	const starts: number[] = [];
	for (let at = from; at < end && starts.length < count; at = lineEnd(text, at, end)) starts.push(at);
	starts.push(end);
	return starts;
}

/** where `text` differs from `old`, line by line, when the changes add up to at most `most` characters; else null */
export function changedRanges(old: string, text: string, most: number): ChangedRange[] | null {
	const shortest = Math.min(old.length, text.length);
	let from = 0;
	while (from < shortest && old.charCodeAt(from) === text.charCodeAt(from)) from++;
	let toA = old.length;
	let toB = text.length;
	while (toA > from && toB > from && old.charCodeAt(toA - 1) === text.charCodeAt(toB - 1)) {
		toA--;
		toB--;
	}
	if (from === toA && from === toB) return [];
	if (Math.max(toA, toB) - from <= most) return [{ fromA: from, toA, fromB: from, toB }];
	// the diff runs between whole lines
	from = old.lastIndexOf('\n', from - 1) + 1;
	const changes: ChangedRange[] = [];
	let changed = 0;
	let a = from;
	let b = from;
	while (a < toA || b < toB) {
		const aEnd = lineEnd(old, a, toA);
		const bEnd = lineEnd(text, b, toB);
		if (a < toA && b < toB && sameLine(old, a, aEnd, text, b, bEnd)) {
			a = aEnd;
			b = bEnd;
			continue;
		}
		const linesA = linesFrom(old, a, toA, RESYNC_LINES);
		const linesB = linesFrom(text, b, toB, RESYNC_LINES);
		let resync: [number, number] | null = null;
		for (let sum = 1; sum <= 2 * RESYNC_LINES && !resync; sum++)
			for (let i = Math.max(0, sum - RESYNC_LINES); i <= Math.min(sum, RESYNC_LINES) && !resync; i++) {
				const j = sum - i;
				if (i >= linesA.length || j >= linesB.length) continue;
				const atA = linesA[i];
				const atB = linesB[j];
				const endsA = atA === toA;
				const endsB = atB === toB;
				if (endsA || endsB) {
					if (endsA && endsB) resync = [atA, atB];
					continue;
				}
				if (sameLine(old, atA, lineEnd(old, atA, toA), text, atB, lineEnd(text, atB, toB))) resync = [atA, atB];
			}
		if (!resync) return null;
		changes.push({ fromA: a, toA: resync[0], fromB: b, toB: resync[1] });
		changed += Math.max(resync[0] - a, resync[1] - b);
		if (changed > most) return null;
		[a, b] = resync;
	}
	return changes;
}
