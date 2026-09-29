// a text change as a list of edits, and positions mapped through it
import { fromLf, type Eol } from '../fileSystem';

/** offsets are in the text before any of the edits */
export type TextEdit = { from: number; to: number; insert: string };

/** `edits` in order, not overlapping */
export function applyEdits(text: string, edits: readonly TextEdit[]): string {
	let out = '';
	let at = 0;
	for (const e of edits) {
		out += text.slice(at, e.from) + e.insert;
		at = e.to;
	}
	return out + text.slice(at);
}

/** LF form edits onto `raw` itself, so lines they do not reach keep their endings (a file can mix CRLF and LF) */
export function editsOnRaw(raw: string, edits: readonly TextEdit[], eol: Eol): TextEdit[] {
	// where each \r\n's \n stands in the LF form, the \r before it dropped
	const dropped: number[] = [];
	for (let i = raw.indexOf('\r\n'); i >= 0; i = raw.indexOf('\r\n', i + 2)) dropped.push(i - dropped.length);
	let k = 0;
	function at(p: number): number {
		while (k < dropped.length && dropped[k] < p) k++;
		return p + k;
	}
	return edits.map((e) => ({ from: at(e.from), to: at(e.to), insert: fromLf(e.insert, eol) }));
}

export function invertEdits(before: string, edits: readonly TextEdit[]): TextEdit[] {
	let shift = 0;
	return edits.map((e) => {
		const from = e.from + shift;
		shift += e.insert.length - (e.to - e.from);
		return { from, to: from + e.insert.length, insert: before.slice(e.from, e.to) };
	});
}

/** in the changed text's offsets */
export function insertedSpans(edits: readonly TextEdit[]): { from: number; to: number }[] {
	let shift = 0;
	return edits.map((e) => {
		const from = e.from + shift;
		shift += e.insert.length - (e.to - e.from);
		return { from, to: from + e.insert.length };
	});
}

/** a range's start: inside a replaced stretch it goes to its start; text put in right at it stays outside */
export function mapStart(pos: number, edits: readonly TextEdit[]): number {
	let shift = 0;
	for (const e of edits) {
		if (e.from > pos) break;
		if (e.from === e.to || pos >= e.to) shift += e.insert.length - (e.to - e.from);
		else return e.from + shift;
	}
	return pos + shift;
}

/** a range's end: inside or at the end of a replaced stretch it goes to its end; text put in right at it stays outside */
export function mapEnd(pos: number, edits: readonly TextEdit[]): number {
	let shift = 0;
	for (const e of edits) {
		if (e.from >= pos) break;
		if (pos > e.to) shift += e.insert.length - (e.to - e.from);
		else return e.from + shift + e.insert.length;
	}
	return pos + shift;
}
