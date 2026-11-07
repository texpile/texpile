import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { repointCitations } from '$lib/languages/latex/visual/plugins/bibliography/repointCitations';

const file = `\\documentclass{article}
\\begin{document}
As shown~\\cite{knuth} and \\cite{lamport,knuth}, not \\cite{knuthx}.

\\begin{thebibliography}{9}
\\bibitem{knuth} D. Knuth. 1968.
\\bibitem{lamport} L. Lamport. 1986.
\\end{thebibliography}
\\end{document}
`;

describe('repointCitations', () => {
	it('renames the key in every citation of it, in the rename’s own transaction', () => {
		const parsed = parseLatexFile(file);
		const state = EditorState.create({ doc: parsed.doc });
		let at = -1;
		state.doc.forEach((n, pos) => {
			if (at < 0 && n.attrs.itemKey === 'knuth') at = pos;
		});
		const tr = state.tr.setNodeMarkup(at, undefined, { ...state.doc.nodeAt(at)!.attrs, itemKey: 'knuth68' });
		repointCitations(tr, state.doc, 'knuth', 'knuth68');
		const out = serializeLatexFile(parsed, state.apply(tr).doc);
		expect(out).toContain('As shown~\\cite{knuth68} and \\cite{lamport,knuth68}, not \\cite{knuthx}.');
		expect(out).toContain('\\bibitem{knuth68} D. Knuth.');
	});
});
