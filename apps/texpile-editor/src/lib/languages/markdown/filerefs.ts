// Markdown file-path references for the move-aware reference updater: the .md counterpart of
// languages/latex/parser/filerefs. Collected from the Lezer markdown tree, which is what the source editor
// already parses with, so a link inside a fenced block or a code span is never touched - neither
// produces a URL node.
//
// Covers inline links and images ([x](p), ![x](p)) and reference definitions ([id]: p). An
// <img src> written as raw HTML is left alone: the tree hands it over as one opaque HTMLBlock.
import { markdownParser } from './syntax/markdownSyntax';
import type { FileRef } from '$lib/workspace/fileRefs';

/** `<dest>` is the escape hatch for destinations with spaces; the brackets are syntax, not path */
function unangle(raw: string): { text: string; angled: boolean } {
	return raw.length >= 2 && raw.startsWith('<') && raw.endsWith('>')
		? { text: raw.slice(1, -1), angled: true }
		: { text: raw, angled: false };
}

/** Every link/image destination in `src`, with the span that holds the path itself. */
export function collectMarkdownFileRefs(src: string): FileRef[] {
	const out: FileRef[] = [];
	markdownParser
		.parse(src)
		.cursor()
		.iterate((n) => {
			if (n.name !== 'URL') return;
			const { text, angled } = unangle(src.slice(n.from, n.to));
			out.push({
				// keep the angle brackets out of the replaced span so their style survives a rewrite
				innerStart: angled ? n.from + 1 : n.from,
				innerEnd: angled ? n.to - 1 : n.to,
				current: text
			});
		});
	return out;
}
