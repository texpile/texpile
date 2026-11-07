// a Typst chip made only of comments (// lines, /* blocks */, nested ones included) drawn folded like a LaTeX % comment
import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { commentFace } from '$lib/editor/visual/extensions/drawnChips/commentFace';

/** the index just past the block comment opened at `from`, or -1 when it never closes */
function blockEnd(source: string, from: number): number {
	let depth = 0;
	for (let i = from; i < source.length - 1; i++) {
		if (source.startsWith('/*', i)) {
			depth++;
			i++;
		} else if (source.startsWith('*/', i)) {
			depth--;
			i++;
			if (depth === 0) return i + 1;
		}
	}
	return -1;
}

export function typstCommentFace(source: string): ChipFace | null {
	const lines: string[] = [];
	let marker = '';
	let i = 0;
	while (i < source.length) {
		if (/\s/.test(source[i])) {
			i++;
			continue;
		}
		if (source.startsWith('//', i)) {
			const end = source.indexOf('\n', i);
			lines.push(source.slice(i + 2, end < 0 ? source.length : end).replace(/^ /, ''));
			marker ||= '//';
			i = end < 0 ? source.length : end + 1;
			continue;
		}
		if (!source.startsWith('/*', i)) return null;
		const end = blockEnd(source, i);
		if (end < 0) return null;
		const body = source
			.slice(i + 2, end - 2)
			.split('\n')
			.map((line) => line.replace(/^\s*\*?\s?/, ''));
		while (body.length > 1 && !body[0].trim()) body.shift();
		while (body.length > 1 && !body[body.length - 1].trim()) body.pop();
		lines.push(...body);
		marker ||= '/*';
		i = end;
	}
	return lines.length ? commentFace(lines, marker) : null;
}
