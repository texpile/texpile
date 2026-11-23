// @vitest-environment jsdom
// a \label on the canvas: LabelDisplay's chip, set off by a quarter space from a word it is glued to
import { expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { FaceElement } from '$lib/editor/canvas';
import { buildHelpersOf, PLAIN_FACE_MEDIA } from '$lib/editor/canvas/views/faceContext';
import { inBuild } from '$lib/editor/canvas/views/buildScope';
import type { VisualView } from '$lib/editor/canvas';
import { labelCanvasView } from '$lib/languages/latex/visual/plugins/label/node/labelCanvasView';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';

const SETTINGS = { justify: false, hyphenate: false, showCaptions: true, imageDirectory: '', cropFormat: '', isMainFile: true };

function build(glued: string | null): FaceElement {
	const label = schema.nodes.label.create({ name: 'sec:intro' });
	const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [schema.text('Intro'), label])]);
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
	const view = { editable: true, state: EditorState.create({ doc }), canvas: { build: tools } } as unknown as VisualView;
	const decorations = glued ? [Decoration.node(6, 7, { 'data-glued': glued })] : [];
	return inBuild(tools, () => labelCanvasView(label, view, () => 6, decorations, DecorationSet.empty)).dom as FaceElement;
}

it('draws the name in its chip', () => {
	const host = build(null);
	expect(host.querySelector('.text-chip-name')?.textContent).toBe('sec:intro');
	expect(host.style.getPropertyValue('margin-left')).toBe('');
});

it('sets the chip off from the word before it', () => {
	expect(build('before').style.getPropertyValue('margin-left')).toBe('calc(1em * 0.25)');
});
