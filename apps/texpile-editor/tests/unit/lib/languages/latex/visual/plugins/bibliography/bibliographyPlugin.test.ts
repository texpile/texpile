import { describe, expect, it } from 'vitest';
import { EditorState, type Plugin } from 'prosemirror-state';
import type { DecorationSet } from 'prosemirror-view';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { bibliographyPlugin } from '$lib/languages/latex/visual/plugins/bibliography/bibliographyPlugin';

const file = `\\documentclass{article}
\\begin{document}
As shown in \\cite{knuth} and \\cite{lamport}.

\\begin{thebibliography}{9}
\\bibitem{knuth} D. Knuth. 1968.
\\bibitem{lamport} L. Lamport. 1986.
\\end{thebibliography}
\\end{document}
`;

function spans(plugin: Plugin, state: EditorState): string[] {
	return (plugin.getState(state) as DecorationSet).find().map((d) => `${d.from}-${d.to}`);
}

describe('the bibliography decorations', () => {
	it('move with text typed before and inside an entry, as a fresh walk places them', () => {
		const plugin = bibliographyPlugin();
		let state = EditorState.create({ doc: parseLatexFile(file).doc, plugins: [plugin] });
		const entryText = state.doc.textContent.indexOf('D. Knuth');
		let inside = -1;
		state.doc.descendants((node, pos) => {
			if (inside < 0 && node.isText && node.text!.includes('D. Knuth')) inside = pos + node.text!.indexOf('D. Knuth');
		});
		expect(entryText).toBeGreaterThan(0);
		state = state.apply(state.tr.insertText('Typed ', 1));
		state = state.apply(state.tr.insertText('Donald ', inside + 'Typed '.length));
		const fresh = EditorState.create({ doc: state.doc, plugins: [plugin] });
		expect(spans(plugin, state)).toEqual(spans(plugin, fresh));
		expect(spans(plugin, state).length).toBeGreaterThan(0);
	});

	it('give each entry a key chip the canvas draws and a first line with a hanging indent', () => {
		const plugin = bibliographyPlugin();
		const state = EditorState.create({ doc: parseLatexFile(file).doc, plugins: [plugin] });
		const found = (plugin.getState(state) as DecorationSet).find();
		const chips = found.filter((d) => (d.spec as { canvas?: { kind: string } }).canvas?.kind === 'inline');
		expect(chips.map((d) => (d.spec as { key: string }).key.split(':').at(-1))).toEqual(['knuth', 'lamport']);
		const styles = found.map((d) => (d as unknown as { type: { attrs?: { style?: string } } }).type.attrs?.style ?? '');
		expect(styles.filter((style) => style.includes('text-indent: -1.5em'))).toHaveLength(2);
	});
});
