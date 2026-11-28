// TODO, FIXME and the like in a comment's text
const MARKERS = new Set(['TODO', 'FIXME', 'XXX', 'HACK']);

export type NoteMarker = { at: number; word: string };

function isLetter(ch: string): boolean {
	return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_';
}

export function noteMarkersIn(comment: string): NoteMarker[] {
	const out: NoteMarker[] = [];
	let i = 0;
	while (i < comment.length) {
		if (!isLetter(comment[i])) {
			i++;
			continue;
		}
		const from = i;
		while (i < comment.length && isLetter(comment[i])) i++;
		const word = comment.slice(from, i);
		if (MARKERS.has(word)) out.push({ at: from, word });
	}
	return out;
}
