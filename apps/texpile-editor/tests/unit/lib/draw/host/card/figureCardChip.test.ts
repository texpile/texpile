// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { drawnChipAtomsPlugin } from '$lib/editor/visual/extensions/drawnChips/drawnChipAtoms';
import { latexNodeViews } from '$lib/languages/latex/visual/latexNodeViews';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { createTestCanvasView } from '../../../editor/canvas/testing/testCanvasView';

it('a block holding one TikZ picture draws as its card, whose Edit figure action opens the picture', () => {
	const picture = '\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}';
	const doc = schema.nodes.doc.create(null, [schema.nodes.raw_latex.create(null, schema.text(picture))]);
	const view = createTestCanvasView(EditorState.create({ doc }), { props: latexNodeViews({ imageDir: () => '' }) });
	const card = (view.nodeDOM(0) as unknown as HTMLElement).querySelector('.figure-card');
	expect(card?.textContent).toContain('TikZ figure');
	const opened: unknown[] = [];
	window.addEventListener('texpileopenfigure', (e) => opened.push((e as CustomEvent).detail), { once: true });
	const [edit] = view.canvas.blockActions(0);
	expect(edit.label).toBe('Edit figure');
	edit.run();
	expect(opened).toEqual([{ index: 0, source: picture }]);
});

// Enter on a selected card added a paragraph under it: the card is no drawn chip to the chip keys
it('opens a selected card on Enter', () => {
	const picture = '\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}';
	const doc = schema.nodes.doc.create(null, [schema.nodes.raw_latex.create(null, schema.text(picture))]);
	const state = EditorState.create({ doc, selection: NodeSelection.create(doc, 0), plugins: [drawnChipAtomsPlugin()] });
	const view = createTestCanvasView(state, { props: latexNodeViews({ imageDir: () => '' }) });
	const opened: unknown[] = [];
	window.addEventListener('texpileopenfigure', (e) => opened.push((e as CustomEvent).detail), { once: true });
	const enter = new KeyboardEvent('keydown', { key: 'Enter' });
	expect(view.someProp('handleKeyDown', (handle) => handle(view as never, enter))).toBe(true);
	expect(opened).toEqual([{ index: 0, source: picture }]);
});
