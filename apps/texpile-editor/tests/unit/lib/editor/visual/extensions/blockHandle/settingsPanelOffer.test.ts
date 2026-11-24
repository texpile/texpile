// @vitest-environment jsdom
// the handle's gear on the canvas: the blocks whose own gear opened settings in the DOM editor offer them by type
import { expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { blockSettingsAt } from '$lib/editor/visual/extensions/blockHandle/blockSettings';
import { latexNodeViews } from '$lib/languages/latex/visual/latexNodeViews';
import { markdownNodeViews } from '$lib/languages/markdown/visual/markdownNodeViews';
import { typstNodeViews } from '$lib/languages/typst/visual/typstNodeViews';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { createTestCanvasView } from '../../../canvas/testing/testCanvasView';

it('offers the settings every block gear opened', () => {
	const offered = (views: { blockSettings?: object }) => Object.keys(views.blockSettings ?? {}).sort();
	expect(offered(latexNodeViews({ imageDir: () => '' }))).toEqual(
		['block_math', 'code_block', 'environment', 'figure_group', 'image', 'table_wrapper'].sort()
	);
	expect(offered(typstNodeViews(() => ''))).toEqual(
		['block_math', 'code_block', 'image', 'table_wrapper', 'typ_env', 'typ_figure', 'typ_grid'].sort()
	);
	expect(offered(markdownNodeViews())).toEqual(['code_block', 'image']);
});

// a code block without its view fell back to the schema's pre and drew no card
it('draws a code block as its card in every language', () => {
	for (const views of [latexNodeViews({ imageDir: () => '' }), typstNodeViews(() => ''), markdownNodeViews()])
		expect(views.nodeViews?.code_block).toBeDefined();
});

it('draws an include as its chip in LaTeX and Typst', () => {
	for (const views of [latexNodeViews({ imageDir: () => '' }), typstNodeViews(() => '')]) expect(views.nodeViews?.includedoc).toBeDefined();
});

it('offers a layout call its settings and a call that is no layout none', () => {
	const { typ_env, paragraph, doc } = typSchema.nodes;
	const align = typ_env.create({ name: 'align', args: 'center' }, paragraph.create(null, typSchema.text('A')));
	const other = typ_env.create({ name: 'note', args: '' }, paragraph.create(null, typSchema.text('B')));
	const state = EditorState.create({ doc: doc.create(null, [align, other]) });
	const view = createTestCanvasView(state, { props: { blockSettings: typstNodeViews(() => '').blockSettings } });
	expect(blockSettingsAt(view, 0)?.label()).toBe('Layout settings');
	expect(blockSettingsAt(view, align.nodeSize)).toBeNull();
});
