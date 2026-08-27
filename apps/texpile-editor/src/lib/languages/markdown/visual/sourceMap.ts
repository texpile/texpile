// Markdown's side of the block source map. The map itself (lib/editor/sourceMap) is format-neutral
// — it runs off the `orig` spans both importers stamp — but its intra-block refinement step needs
// to know what markup looks like, and that part is per-dialect.
//
// What the refinement does: take the block's ORIGINAL SOURCE up to a source offset, strip the
// markup, and read off the last word. That word is then located in the block's RENDERED text to
// place the caret. So the property that actually matters is not "pretty output" — it is that the
// words surviving the strip match the rendered text's words, in the same order and count. Anything
// the reader never sees (link targets, reference definitions, HTML attributes) must NOT survive, or
// it inflates the occurrence count and the caret lands on the wrong repeat of a word.

/** strip Markdown syntax so what's left resembles the rendered text the editor shows. */
export function stripMarkdown(s: string): string {
	return (
		s
			// fence delimiters go, the code text stays: a code block renders its own contents
			.replace(/^[ \t]*(?:```+|~~~+).*$/gm, ' ')
			.replace(/`+/g, '')
			// block markers: ATX hashes, setext underlines, quote arrows, bullets + task boxes
			.replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
			.replace(/^[ \t]*(?:=+|-{2,})[ \t]*$/gm, ' ')
			.replace(/^[ \t]*>+[ \t]?/gm, '')
			.replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm, '')
			// thematic breaks and a table's alignment rule render as no words at all
			.replace(/^[ \t]*(?:\*[ \t]*){3,}$/gm, ' ')
			.replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/gm, ' ')
			.replace(/\|/g, ' ')
			// links and images keep their visible text and never their target
			.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
			.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
			.replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
			.replace(/^[ \t]*\[[^\]]+\]:.*$/gm, ' ') // reference definitions are invisible
			// raw html and autolinks: tags and urls are chrome, their text content stays
			.replace(/<[^>]*>/g, ' ')
			// emphasis delimiters. `_` only at word edges, so snake_case_word survives as ONE word
			// exactly as the reader sees it — this is where reusing stripLatex went wrong
			.replace(/[*~]/g, '')
			.replace(/(^|[^\p{L}\p{N}])_+|_+(?=[^\p{L}\p{N}]|$)/gu, '$1')
			// $-math: the formula is a leaf node the text index counts as one object char
			.replace(/\$+/g, ' ')
			// backslash escapes reveal the character the reader actually sees
			.replace(/\\([^\p{L}\p{N}])/gu, '$1')
	);
}
