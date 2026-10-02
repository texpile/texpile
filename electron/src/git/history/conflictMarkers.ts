// Whether a file still holds a place git marked when both sides of a merge changed the same lines.
// The editor has the full parser (apps/texpile-editor/src/lib/workspace/scm/conflictMarkers.ts); this
// side only needs yes or no, and answers it as VS Code does before a file counts as settled: any
// one marker line left, `<<<<<<< `, `>>>>>>> `, diff3's `|||||||` or a lone `=======`, read line by
// line whatever the line endings. Deleting just the first line of a place used to read as choosing
// it, and the rest went into the version - where a stray ======= prints in the PDF.

const MARKER = /^<{7}\s|^={7}$|^>{7}\s|^\|{7}(\s|$)/;
const DIVIDER = /^={7}$/;

/** each line a side has a lone ======= right under: a Markdown heading, with its underline */
function headingsIn(text: string): string[] {
	const lines = text.split(/\r\n|\r|\n/);
	return lines.flatMap((line, i) => (i > 0 && DIVIDER.test(line) && lines[i - 1].trim() ? [lines[i - 1]] : []));
}

/** `sides`: the file as each side of the merge has it. A lone ======= under a line that one of them
 *  also has it under is the author's own, a heading's underline */
export function hasConflictMarkers(text: string, sides: string[] = []): boolean {
	if (!text.includes('<<<<<<<') && !text.includes('=======') && !text.includes('>>>>>>>') && !text.includes('|||||||')) return false;
	const headings = new Set(sides.flatMap(headingsIn));
	const lines = text.split(/\r\n|\r|\n/);
	return lines.some((line, i) => MARKER.test(line) && !(DIVIDER.test(line) && i > 0 && headings.has(lines[i - 1])));
}
