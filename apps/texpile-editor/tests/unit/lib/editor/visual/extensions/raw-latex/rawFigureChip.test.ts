// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { latexNodeViews } from '$lib/languages/latex/visual/latexNodeViews';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { createTestCanvasView } from '../../../canvas/testing/testCanvasView';

it('a raw block with two pictures keeps its source under a strip of them', () => {
	const text = '\\begin{figure}\\includegraphics{a.png}\\hfill\\includegraphics{b.png}\\end{figure}';
	const doc = schema.nodes.doc.create(null, [schema.nodes.raw_latex.create(null, schema.text(text))]);
	const view = createTestCanvasView(EditorState.create({ doc }), { props: latexNodeViews({ imageDir: () => '/paper' }) });
	const block = view.nodeDOM(0) as unknown as HTMLElement;
	expect(block.firstElementChild?.querySelectorAll('.raw-figure-picture').length).toBe(2);
});
