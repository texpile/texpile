// the lines the waiting card shows from what TeX names during a compile

export type CompileNoteKind = 'plain' | 'warning' | 'error';

const PAGE_MARKS = /^\[\d+\]( \[\d+\])*$/;
const PAGES_PER_LINE = 8;

/** pages shipped in a row share a line */
export function addCompileNotes(lines: string[], notes: string[], keep: number): string[] {
	const next = [...lines];
	for (const note of notes) {
		const last = next.at(-1);
		const joins = last && PAGE_MARKS.test(note) && PAGE_MARKS.test(last) && last.split(' ').length < PAGES_PER_LINE;
		if (joins) next[next.length - 1] = `${last} ${note}`;
		else next.push(note);
	}
	return next.slice(-keep);
}

export function lastPageShipped(notes: string[]): number | undefined {
	const mark = notes.findLast((note) => PAGE_MARKS.test(note));
	return mark ? Number(mark.slice(1, -1)) : undefined;
}

export function compileNoteKind(note: string): CompileNoteKind {
	if (note.startsWith('! ')) return 'error';
	const said = /^(?:LaTeX|Package|Class)\b.*\b(Warning|Error)\b/.exec(note)?.[1];
	return said ? (said === 'Error' ? 'error' : 'warning') : 'plain';
}
