// @vitest-environment jsdom
// a reference on the canvas prints what RefDisplay printed: the number the editor counts, red when the compiler calls it undefined
import { afterEach, expect, it } from 'vitest';
import { DecorationSet } from 'prosemirror-view';
import type { FaceElement, VisualView } from '$lib/editor/canvas';
import { buildHelpersOf, PLAIN_FACE_MEDIA } from '$lib/editor/canvas/views/faceContext';
import { inBuild } from '$lib/editor/canvas/views/buildScope';
import { refCanvasView } from '$lib/languages/latex/visual/plugins/crossReference/node/refCanvasView';
import { compileLog } from '$lib/stores/compileLogStore';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';

const SETTINGS = { justify: false, hyphenate: false, showCaptions: true, imageDirectory: '', cropFormat: '', isMainFile: true };

function build(label: string): FaceElement {
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
	const node = schema.nodes.ref.create({ command: 'ref' }, schema.text(label));
	return inBuild(tools, () => refCanvasView()(node, view, () => 0, [], DecorationSet.empty)).dom as FaceElement;
}

afterEach(() => {
	compileLog.current = null;
});

it('prints the label in the reference color while nothing counts it', () => {
	const root = build('sec:intro');
	expect(root.textContent).toBe('sec:intro');
	expect(root.style.getPropertyValue('color')).toBe('var(--color-ref-fg)');
});

it('turns red when the compiler says the label is undefined', () => {
	compileLog.current = { entries: [{ ruleId: 'undefined-reference', anchorText: 'sec:gone' }] } as unknown as typeof compileLog.current;
	const root = build('sec:gone');
	expect(root.style.getPropertyValue('color')).toBe('var(--color-ref-broken-fg)');
	expect(root.hint).toBe('Label "sec:gone" not found');
});
