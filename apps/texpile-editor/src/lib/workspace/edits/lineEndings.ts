// the editor works in LF internally; a file's endings are read on load and re-applied on save
import { diffArrays } from 'diff';

const LINE_BREAK = /\r\n|\r|\n/g;
// a rewrite past this gives its lines the dominant ending rather than hold up the save
const DIFF_LIMITS = { maxEditLength: 1000, timeout: 100 };

/** a file whose lines end in more than one way, as it was read */
export class MixedEol {
	/** what a new or changed line ends with: the more common of CRLF and LF */
	readonly dominant: '\r\n' | '\n';

	constructor(
		private readonly lines: string[],
		private readonly endings: string[]
	) {
		const crlf = endings.filter((e) => e === '\r\n').length;
		const lf = endings.filter((e) => e === '\n').length;
		this.dominant = crlf >= lf ? '\r\n' : '\n';
	}

	/** `text` (LF) with every line it kept from the file ending the way it did there */
	restore(text: string): string {
		const next = text.split('\n');
		const kept = keptLines(this.lines, next);
		let out = next[0];
		for (let i = 1; i < next.length; i++) out += (this.endings[kept[i - 1]] ?? this.dominant) + next[i];
		return out;
	}
}

export type Eol = '\r\n' | '\n' | MixedEol;

/** for each line of `next`, the line of `old` it was kept from, or -1 */
function keptLines(old: string[], next: string[]): number[] {
	const kept = next.map(() => -1);
	const shorter = Math.min(old.length, next.length);
	let head = 0;
	while (head < shorter && old[head] === next[head]) {
		kept[head] = head;
		head++;
	}
	let tail = 0;
	while (tail < shorter - head && old[old.length - 1 - tail] === next[next.length - 1 - tail]) {
		kept[next.length - 1 - tail] = old.length - 1 - tail;
		tail++;
	}
	const changes = diffArrays(old.slice(head, old.length - tail), next.slice(head, next.length - tail), DIFF_LIMITS);
	let from = head;
	let to = head;
	for (const change of changes ?? []) {
		if (change.added) to += change.count;
		else if (change.removed) from += change.count;
		else for (let k = 0; k < change.count; k++) kept[to++] = from++;
	}
	return kept;
}

/** CRLF if any \r\n is present, else LF; each line's own when the file mixes them */
export function detectEol(text: string): Eol {
	const endings = text.match(LINE_BREAK) ?? [];
	if (new Set(endings).size > 1) return new MixedEol(text.split(LINE_BREAK), endings);
	return text.includes('\r\n') ? '\r\n' : '\n';
}

export function toLf(text: string): string {
	return text.replace(/\r\n?/g, '\n');
}

export function fromLf(text: string, eol: Eol): string {
	if (eol instanceof MixedEol) return eol.restore(text);
	return eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
}
