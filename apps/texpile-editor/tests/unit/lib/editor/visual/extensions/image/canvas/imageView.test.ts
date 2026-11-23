// @vitest-environment jsdom
// a figure on the canvas: its picture fitted as imageNodeView fitted it, and the note when its file is gone
import { expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { imagePlugin } from '$lib/editor/visual/extensions/image/plugin';
import { imageViews, pictureLook } from '$lib/editor/visual/extensions/image/canvas/imageView';
import { createLocalImageSettings } from '$lib/editor/visual/extensions/image/imageplugin.svelte';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { createTestCanvasView } from '../../../../canvas/testing/testCanvasView';

const settings = { ...createLocalImageSettings(() => '/paper'), downloadImage: async () => '' };

function image(attrs: Record<string, unknown>) {
	return schema.nodes.image.create({ src: 'figs/plot.png', ...attrs }, schema.text('A plot.'));
}

it('scales a written width to the column less its margins, and caps every picture at it', () => {
	expect(pictureLook(image({ width: 300, maxWidth: 600 }), settings).width).toBe('calc((100% - 30px) * 0.5)');
	expect(pictureLook(image({ width: 300 }), settings).width).toBe('300px');
	expect(pictureLook(image({}), settings).maxWidth).toBe('calc(100% - 30px)');
});

it('draws a picture with no size across the column where resizing is off, as the Markdown editor did', () => {
	expect(pictureLook(image({}), { ...settings, enableResize: false })).toMatchObject({ width: '100%', maxWidth: '100%' });
	expect(pictureLook(image({}), { ...settings, enableResize: true }).width).toBeUndefined();
});

it('draws the missing-file note in the picture place, with the caption still under it', async () => {
	const doc = schema.nodes.doc.create(null, [image({})]);
	const view = createTestCanvasView(EditorState.create({ doc, plugins: [imagePlugin(settings)] }), {
		props: { nodeViews: imageViews('latex').nodeViews }
	});
	await new Promise((done) => setTimeout(done, 0));
	view.dispatch(view.state.tr.setMeta('relayout', true));
	const root = view.nodeDOM(0) as unknown as HTMLElement;
	expect(root.querySelector('.image-missing')?.textContent).toContain('figs/plot.png');
	expect(root.querySelector('.text')).not.toBeNull();
});

it('counts a labeled picture into its caption where the language counts its own figures', () => {
	const doc = schema.nodes.doc.create(null, [image({ label: 'fig:one' }), image({ label: 'fig:two' }), image({})]);
	const view = createTestCanvasView(EditorState.create({ doc, plugins: [imagePlugin(settings)] }), {
		props: { nodeViews: imageViews('typst').nodeViews, language: 'typst' }
	});
	const marks = [0, 1, 2].map((i) => {
		let pos = 0;
		for (let j = 0; j < i; j++) pos += doc.child(j).nodeSize;
		return (
			(
				view.nodeDOM(pos) as unknown as { querySelector(s: string): { generatedBefore: { textContent: string } | null } | null }
			).querySelector('.text')?.generatedBefore?.textContent ?? null
		);
	});
	expect(marks).toEqual(['Figure 1: ', 'Figure 2: ', null]);
});
