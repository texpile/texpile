// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { closeChipPanel } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
import { drawnOrSource } from '$lib/editor/visual/extensions/drawnChips/DrawnChipView';
import { latexChipKind } from '$lib/languages/latex/visual/extensions/latexChipKind';
import { unfocusedPressCaret } from '$lib/editor/visual/extensions/unfocusedPress';

const file = `\\documentclass{article}
\\begin{document}
Before.\\footnote{A note.} After the note.
\\end{document}
`;

describe('a press into the visual editor without focus', () => {
	it('moves a node selection to where it lands, so the next key leaves the node', () => {
		const parsed = parseLatexFile(file);
		const place = document.createElement('div');
		document.body.appendChild(place);
		const view = new EditorView(place, {
			state: EditorState.create({ doc: parsed.doc, plugins: [unfocusedPressCaret()] }),
			nodeViews: {
				inline_latex: (node, v, getPos, decorations) => drawnOrSource(node, v, getPos as () => number, decorations, latexChipKind(v, false))
			}
		});
		place.querySelector('.drawn-chip')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
		expect(view.state.selection).toBeInstanceOf(NodeSelection);
		closeChipPanel('away');

		// jsdom has no layout: the press lands on the end of the paragraph
		const end = view.state.doc.firstChild!.nodeSize - 1;
		view.posAtCoords = () => ({ pos: end, inside: -1 });
		place.querySelector('p')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
		view.dispatch(view.state.tr.insertText('Q'));
		expect(serializeLatexFile(parsed, view.state.doc)).toContain('Before.\\footnote{A note.} After the note.Q');
		view.destroy();
	});
});
