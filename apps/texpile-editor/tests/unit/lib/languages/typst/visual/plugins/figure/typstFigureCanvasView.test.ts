// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { EditorState, Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { parseTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { typstNodeViews } from '$lib/languages/typst/visual/typstNodeViews';
import { blockSettingsAt } from '$lib/editor/visual/extensions/blockHandle/blockSettings';
import { createTestCanvasView } from '../../../../../editor/canvas/testing/testCanvasView';

const GRID =
	'#figure(\n  grid(\n    columns: 2,\n    gutter: 1em,\n    image("wide.png"),\n    image("wide.png"),\n  ),\n  caption: [Two shots],\n)\n';

it('a figure holding a grid of pictures draws its cells', () => {
	const { doc } = parseTypstFile(GRID);
	const views = typstNodeViews(() => '');
	const view = createTestCanvasView(EditorState.create({ doc }), { props: { nodeViews: views.nodeViews } });
	const figure = view.nodeDOM(0) as unknown as HTMLElement;
	expect(figure.querySelectorAll('.imagePluginRoot').length).toBe(2);
});

it("the caption opens with the number the figure's decoration carries", () => {
	const { doc } = parseTypstFile(GRID);
	const numbers = new Plugin({
		props: {
			decorations: (state) =>
				DecorationSet.create(state.doc, [
					Decoration.node(0, state.doc.firstChild!.nodeSize, {}, { numbers: [1], captionPrefix: 'Figure 1:' })
				])
		}
	});
	const views = typstNodeViews(() => '');
	const view = createTestCanvasView(EditorState.create({ doc, plugins: [numbers] }), { props: { nodeViews: views.nodeViews } });
	const caption = (view.nodeDOM(0) as unknown as HTMLElement).querySelector('.typ-figure-caption') as unknown as {
		generatedBefore?: { textContent: string };
	};
	expect(caption.generatedBefore?.textContent).toBe('Figure 1:');
});

it("the figure's gear opens the settings of the grid it wraps", () => {
	const { doc } = parseTypstFile(GRID);
	const views = typstNodeViews(() => '');
	const view = createTestCanvasView(EditorState.create({ doc }), { props: views });
	expect(blockSettingsAt(view, 0)?.label()).toBe(blockSettingsAt(view, 1)?.label());
	expect(blockSettingsAt(view, 1)).not.toBeNull();
});
