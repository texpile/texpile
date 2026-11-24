// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { chipPanel, closeChipPanel } from '$lib/editor/visual/extensions/drawnChips/chipPanel/chipPanel.svelte';
import { keyedEntriesInDoc } from '$lib/languages/latex/visual/core';
import { openBibKeyPanel, readHead } from '$lib/languages/latex/visual/plugins/bibliography/bibKeyPanel';
import { createTestCanvasView } from '../../../../../editor/canvas/testing/testCanvasView';

const file = `\\documentclass{article}
\\begin{document}
As shown in \\cite{knuth}.

\\begin{thebibliography}{9}
\\bibitem{knuth} D. Knuth. 1968.
\\end{thebibliography}
\\end{document}
`;

describe('the bibitem key chip panel', () => {
	it('reads a head only when it is whole', () => {
		expect(readHead('bibitem', '\\bibitem[Knu68]{knuth}')).toEqual({ key: 'knuth', label: 'Knu68' });
		expect(readHead('bibitem', '\\bibitem{knuth}')).toEqual({ key: 'knuth', label: null });
		expect(readHead('bibitem', '\\bibitem[Knu{knuth}')).toBeNull();
		expect(readHead('bibitem', '\\bibitem{knu')).toBeNull();
	});

	it('writes key and label as typed and moves the citations once, on close', () => {
		const parsed = parseLatexFile(file);
		const view = createTestCanvasView(EditorState.create({ doc: parsed.doc }));
		const [entry] = keyedEntriesInDoc(view.state.doc);
		openBibKeyPanel(view, () => keyedEntriesInDoc(view.state.doc)[0].pos, entry.command, new DOMRect(10, 10, 40, 16));
		const request = chipPanel.request!;
		expect(request.source).toBe('\\bibitem{knuth}');

		request.write('\\bibitem[Knu68]{knu');
		expect(serializeLatexFile(parsed, view.state.doc)).toContain('\\bibitem{knuth} D. Knuth.');
		request.write('\\bibitem[Knu68]{knuth68}');
		let out = serializeLatexFile(parsed, view.state.doc);
		expect(out).toContain('\\bibitem[Knu68]{knuth68} D. Knuth.');
		expect(out).toContain('\\cite{knuth}');

		closeChipPanel('enter');
		out = serializeLatexFile(parsed, view.state.doc);
		expect(out).toContain('\\cite{knuth68}');
		view.destroy();
	});
});
