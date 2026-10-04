// The places a merge left marked in a file, where both sides changed the same lines and git would
// not pick one:
//
//   <<<<<<< HEAD
//   this side's lines
//   ||||||| base          (only with merge.conflictStyle diff3 / zdiff3)
//   the lines both started from
//   =======
//   the other side's lines
//   >>>>>>> origin/main
//
// Offsets count a line break as one character, which is how the editor holds text (LF); a CRLF
// file's \r stays on the end of its line and is carried along with it.

export type Span = { from: number; to: number };

export type ConflictBlock = {
	/** start of the <<<<<<< line */
	from: number;
	/** past the >>>>>>> line and its line break */
	to: number;
	/** this side's lines, each with its line break */
	mine: Span;
	/** the lines both sides started from, when git wrote them (diff3) */
	base: Span | null;
	theirs: Span;
	/** what git called each side: HEAD, a branch, 'origin/main' */
	mineLabel: string;
	theirsLabel: string;
	/** each marker line's text, without its line break */
	markers: { open: Span; base: Span | null; divider: Span; close: Span };
	/** the >>>>>>> line ends the file with no line break after it */
	atEnd: boolean;
};

export type ConflictChoice = 'mine' | 'theirs' | 'both';

/** the words after a run of seven `ch`, or null when the line is not that marker. Seven exactly:
 *  eight is someone's own text, and so is `<<<<<<<word` */
function markerLabel(line: string, ch: string): string | null {
	if (!line.startsWith(ch.repeat(7))) return null;
	const rest = line.slice(7).replace(/\r$/, '');
	if (rest === '') return '';
	if (rest[0] !== ' ' && rest[0] !== '\t') return null;
	return rest.trim();
}

function isDivider(line: string): boolean {
	return /^={7}[ \t]*\r?$/.test(line);
}

type Open = {
	from: number;
	open: Span;
	mineLabel: string;
	mineFrom: number;
	mineTo?: number;
	base?: { marker: Span; from: number; to?: number };
	divider?: Span;
	theirsFrom?: number;
};

/**
 * Every complete marked place, in order. A block that never closes is not one (the author may be
 * typing it, or it is someone's example text), and a <<<<<<< inside a block starts over from there:
 * whatever came before it was never a complete block.
 */
export function scanConflicts(lines: Iterable<string>): ConflictBlock[] {
	const out: ConflictBlock[] = [];
	let pos = 0;
	let open: Open | null = null;
	for (const line of lines) {
		const span = { from: pos, to: pos + line.length };
		const next = span.to + 1;
		const opening = markerLabel(line, '<');
		if (opening !== null) {
			open = { from: pos, open: span, mineLabel: opening, mineFrom: next };
		} else if (open && open.theirsFrom === undefined) {
			if (!open.base && markerLabel(line, '|') !== null) {
				open.mineTo = pos;
				open.base = { marker: span, from: next };
			} else if (isDivider(line)) {
				if (open.base) open.base.to = pos;
				else open.mineTo = pos;
				open.divider = span;
				open.theirsFrom = next;
			}
		} else if (open) {
			const closing = markerLabel(line, '>');
			if (closing !== null) {
				out.push({
					from: open.from,
					to: next,
					mine: { from: open.mineFrom, to: open.mineTo! },
					base: open.base ? { from: open.base.from, to: open.base.to! } : null,
					theirs: { from: open.theirsFrom!, to: pos },
					mineLabel: open.mineLabel,
					theirsLabel: closing,
					markers: { open: open.open, base: open.base?.marker ?? null, divider: open.divider!, close: span },
					atEnd: false
				});
				open = null;
			}
		}
		pos = next;
	}
	// the last line has no break after it: `pos` ran one past the end of the text
	const end = pos - 1;
	const last = out.at(-1);
	if (last && last.to > end) {
		last.to = end;
		last.atEnd = true;
	}
	return out;
}

export function findConflicts(text: string): ConflictBlock[] {
	// most files have none, and this runs on every status read and file open
	return text.includes('<<<<<<<') ? scanConflicts(text.split('\n')) : [];
}

export function hasConflictMarkers(text: string): boolean {
	return findConflicts(text).length > 0;
}

/** a line git writes as a marker, `<<<<<<< `, diff3's `|||||||`, a lone `=======` or `>>>>>>> `,
 *  whether or not it is still part of a whole place: the rule Complete Merge checks by
 *  (electron/src/git/history/conflictMarkers.ts) */
export const MARKER_LINE = /^<{7}\s|^={7}$|^>{7}\s|^\|{7}(\s|$)/;

/** any marker line left, a stray one from a place settled by hand included */
export function hasMarkerLines(text: string): boolean {
	if (!text.includes('<<<<<<<') && !text.includes('=======') && !text.includes('>>>>>>>') && !text.includes('|||||||')) return false;
	return text.split(/\r\n|\r|\n/).some((line) => MARKER_LINE.test(line));
}

/** 1-based line of the first marked place, or null */
export function firstConflictLine(text: string): number | null {
	const first = findConflicts(text)[0];
	if (!first) return null;
	let line = 1;
	for (let i = text.indexOf('\n'); i !== -1 && i < first.from; i = text.indexOf('\n', i + 1)) line++;
	return line;
}

/**
 * The text that replaces a whole block, markers and all. `both` is this side's lines, then theirs:
 * the order git's own "union" merge uses. When the block ended the file with no line break, the
 * replacement does not add one.
 */
export function resolveConflict(slice: (from: number, to: number) => string, block: ConflictBlock, choice: ConflictChoice): string {
	const mine = slice(block.mine.from, block.mine.to);
	const theirs = slice(block.theirs.from, block.theirs.to);
	const text = choice === 'mine' ? mine : choice === 'theirs' ? theirs : mine + theirs;
	return block.atEnd ? text.replace(/\r?\n$/, '') : text;
}
