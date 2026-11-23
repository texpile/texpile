// @vitest-environment jsdom
// the group had no canvas view and drew its pictures stacked under a plain caption
import { expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { imagePlugin } from '$lib/editor/visual/extensions/image/plugin';
import { imageViews } from '$lib/editor/visual/extensions/image/canvas/imageView';
import { createLocalImageSettings } from '$lib/editor/visual/extensions/image/imageplugin.svelte';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { figureGroupCaptionView, figureGroupView } from '$lib/languages/latex/visual/plugins/float/figureGroup/figureGroupView';
import { createTestCanvasView } from '../../../../../../editor/canvas/testing/testCanvasView';

const settings = { ...createLocalImageSettings(() => '/paper'), downloadImage: async () => '' };

it('sets the pictures in one row and letters each captioned one', async () => {
	const picture = (caption: string, showCaption = true) =>
		schema.nodes.image.create({ src: `figs/${caption}.png`, showCaption }, caption ? schema.text(caption) : null);
	const group = schema.nodes.figure_group.create(null, [
		picture('Left'),
		picture('', false),
		picture('Right'),
		schema.nodes.figure_caption.create(null, schema.text('Both'))
	]);
	const doc = schema.nodes.doc.create(null, [group]);
	const view = createTestCanvasView(EditorState.create({ doc, plugins: [imagePlugin(settings)] }), {
		props: {
			nodeViews: { ...imageViews('latex').nodeViews, figure_group: figureGroupView, figure_caption: figureGroupCaptionView }
		}
	});
	await new Promise((done) => setTimeout(done, 0));
	view.dispatch(view.state.tr.setMeta('relayout', true));
	const root = view.nodeDOM(0) as unknown as { querySelector(s: string): { style: { display: string } } | null };
	expect(root.querySelector('.figure-group-body')?.style.display).toBe('flex');
	const letters: string[] = [];
	view.state.doc.descendants((node, pos) => {
		if (node.type.name !== 'image') return true;
		const caption = (
			view.nodeDOM(pos) as unknown as { querySelector(s: string): { generatedBefore?: { textContent: string } | null } | null }
		).querySelector('.text');
		letters.push(caption?.generatedBefore?.textContent ?? '');
		return false;
	});
	expect(letters).toEqual(['(a) ', '', '(b) ']);
});
