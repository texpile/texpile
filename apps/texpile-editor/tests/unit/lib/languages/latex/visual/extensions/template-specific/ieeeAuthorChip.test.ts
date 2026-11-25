// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { latexNodeViews } from '$lib/languages/latex/visual/latexNodeViews';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { createTestCanvasView } from '../../../../../editor/canvas/testing/testCanvasView';

it('an IEEE author block keeps its source under a card for each author', () => {
	const text =
		'\\author{\\IEEEauthorblockN{Ada Lovelace}\n\\IEEEauthorblockA{\\textit{Analytical Engines}\\\\London}\n\\and\n\\IEEEauthorblockN{Alan Turing}\n\\IEEEauthorblockA{Bletchley}}';
	const doc = schema.nodes.doc.create(null, [schema.nodes.raw_latex.create(null, schema.text(text))]);
	const view = createTestCanvasView(EditorState.create({ doc }), { props: latexNodeViews({ imageDir: () => '' }) });
	const row = (view.nodeDOM(0) as unknown as HTMLElement).firstElementChild;
	expect([...(row?.querySelectorAll('.ieee-author-name') ?? [])].map((name) => name.textContent)).toEqual(['Ada Lovelace', 'Alan Turing']);
});
