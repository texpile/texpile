// Whether a file still holds a place git marked when both sides of a merge changed the same lines.
// The editor has the full parser (apps/texpile-editor/src/lib/workspace/scm/conflictMarkers.ts); this
// side only needs yes or no, and answers it as VS Code does before a file counts as settled: any
// one marker line left, `<<<<<<< `, `>>>>>>> `, diff3's `|||||||` or a lone `=======`, read line by
// line whatever the line endings. Deleting just the first line of a place used to read as choosing
// it, and the rest went into the version - where a stray ======= prints in the PDF.

const MARKER = /^<{7}\s|^={7}$|^>{7}\s|^\|{7}(\s|$)/;

export function hasConflictMarkers(text: string): boolean {
	if (!text.includes('<<<<<<<') && !text.includes('=======') && !text.includes('>>>>>>>') && !text.includes('|||||||')) return false;
	return text.split(/\r\n|\r|\n/).some((line) => MARKER.test(line));
}
