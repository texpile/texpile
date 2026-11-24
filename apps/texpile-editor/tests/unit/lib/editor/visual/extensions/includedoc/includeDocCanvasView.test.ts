// @vitest-environment jsdom
// an \input on the canvas reads as the LaTeX it is, its path in the reference color
import { expect, it } from 'vitest';
import { DecorationSet } from 'prosemirror-view';
import type { FaceElement, VisualView } from '$lib/editor/canvas';
import { buildHelpersOf, PLAIN_FACE_MEDIA } from '$lib/editor/canvas/views/faceContext';
import { inBuild } from '$lib/editor/canvas/views/buildScope';
import { includeDocCanvasView } from '$lib/editor/visual/extensions/includedoc/includeDocCanvasView';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';

const SETTINGS = { justify: false, hyphenate: false, showCaptions: true, imageDirectory: '', cropFormat: '', isMainFile: true };

it('writes \\input{path} with the path in the reference color', () => {
	const tools = buildHelpersOf({
		view: {} as VisualView,
		language: 'latex',
		editable: true,
		settings: SETTINGS,
		schema,
		counters: { at: () => 0 },
		media: PLAIN_FACE_MEDIA,
		record: () => {}
	});
	const view = { editable: true, state: {}, canvas: { build: tools } } as unknown as VisualView;
	const node = schema.nodes.includedoc.create({ path: 'sections/intro', command: 'input' });
	const dom = inBuild(tools, () => includeDocCanvasView(() => '')(node, view, () => 0, [], DecorationSet.empty)).dom as FaceElement;
	expect(dom.querySelector('.includedoc-code')?.textContent).toBe('\\input{sections/intro}');
	expect((dom.querySelector('.includedoc-path') as FaceElement).style.getPropertyValue('color')).toBe('var(--ref-fg)');
});
