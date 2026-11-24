// @vitest-environment jsdom
// a node view's overlays mounted beside view.dom: shown while their node is hovered, gone when it is not
import { expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { EditorState } from 'prosemirror-state';
import type { CanvasNodeViewConstructor, VisualView } from '$lib/editor/canvas';
import type { HoverTracker } from '$lib/editor/canvas/interaction/hover/hoverState.svelte';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import OverlayProbe from './OverlayProbe.svelte';
import { createTestCanvasView } from '../testing/testCanvasView';

const paragraph: CanvasNodeViewConstructor = (_node, view) => {
	const dom = view.canvas.build.el('p');
	return {
		dom,
		contentDOM: dom,
		overlays: () => [{ key: 'gear', component: OverlayProbe, props: { label: 'Gear' }, anchor: {}, placement: 'inFlow', when: 'hovered' }]
	};
};

function shownOverlays(view: VisualView): string[] {
	const layer = view.dom.previousElementSibling;
	return [...(layer?.querySelectorAll('[data-overlay-key]') ?? [])].map((el) => el.textContent ?? '');
}

it('mounts a hovered node view overlay before view.dom and takes it down when the pointer leaves', () => {
	const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text('Words.'))]);
	const view = createTestCanvasView(EditorState.create({ doc }), { props: { nodeViews: { paragraph } } });
	const hover = view.canvas.hover as HoverTracker;
	// the paragraph's view is built when it is first laid out
	view.nodeDOM(0);
	expect(view.dom.previousElementSibling?.classList.contains('canvas-overlay-layer')).toBe(true);
	expect(shownOverlays(view)).toEqual([]);
	hover.update({ blockFor: 0 });
	flushSync();
	expect(shownOverlays(view)).toEqual(['Gear']);
	hover.update({ blockFor: null });
	flushSync();
	expect(shownOverlays(view)).toEqual([]);
});

it('keeps an overlay mounted while its node view is built again, so its state lives on', () => {
	const rebuilt: CanvasNodeViewConstructor = (node, view, getPos) => ({
		...paragraph(node, view, getPos, [], null as never),
		update: () => false
	});
	const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text('Words.'))]);
	const view = createTestCanvasView(EditorState.create({ doc }), { props: { nodeViews: { paragraph: rebuilt } } });
	const hover = view.canvas.hover as HoverTracker;
	view.nodeDOM(0);
	hover.update({ blockFor: 0 });
	flushSync();
	const before = view.dom.previousElementSibling!.querySelector('[data-overlay-key]');
	view.dispatch(view.state.tr.insertText('More ', 1));
	view.nodeDOM(0);
	flushSync();
	expect(view.dom.previousElementSibling!.querySelector('[data-overlay-key]')).toBe(before);
});
