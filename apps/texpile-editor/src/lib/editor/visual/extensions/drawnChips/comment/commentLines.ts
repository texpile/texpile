// a comment chip as its words: every line's marker (%, // and the space after it) kept as written
export type CommentLines = { marker: '%' | '//'; markers: string[]; text: string };

const LINE = /^(\s*(%+|\/\/+) ?)(.*)$/;

/** null unless every line is a comment of the same kind */
export function readComment(source: string): CommentLines | null {
	const body = source.endsWith('\n') ? source.slice(0, -1) : source;
	const markers: string[] = [];
	const texts: string[] = [];
	let marker: CommentLines['marker'] | null = null;
	for (const line of body.split('\n')) {
		const match = LINE.exec(line);
		const kind = match?.[2].startsWith('%') ? '%' : '//';
		if (!match || (marker && kind !== marker)) return null;
		marker = kind;
		markers.push(match[1]);
		texts.push(match[3]);
	}
	return marker ? { marker, markers, text: texts.join('\n') } : null;
}

/** a line added past the old ones takes the marker of the last */
export function writeComment(source: string, comment: CommentLines, text: string): string {
	const last = comment.markers[comment.markers.length - 1];
	const lines = text.split('\n').map((line, i) => (comment.markers[i] ?? last) + line);
	return lines.join('\n') + (source.endsWith('\n') ? '\n' : '');
}
