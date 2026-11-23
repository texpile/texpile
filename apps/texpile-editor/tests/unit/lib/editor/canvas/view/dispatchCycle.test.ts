import { describe, expect, it, vi } from 'vitest';
import { EditorState, Plugin, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { DispatchCycle, type DispatchParts } from '$lib/editor/canvas/view/dispatchCycle';
import { POINTER_DRAG_META } from '$lib/editor/canvas/interaction/pointer/autoscroll';

function cycleOn(state: EditorState) {
	const afterUpdate = vi.fn();
	const noop = () => {};
	const scroller = { scrollTop: 5 } as HTMLElement;
	const parts = {
		exposed: { someProp: () => undefined } as unknown as EditorView,
		fields: { state, editable: true, dragging: null, affinity: 1 },
		props: { props: {}, propsFor: noop, applyAttributes: noop, attributesFor: () => ({}), directPlugins: [] },
		pluginViews: { update: noop },
		listeners: { ensure: noop },
		index: { update: noop },
		elements: { setDecorations: noop, markSelection: noop },
		model: { replaced: noop, breakingChanged: noop },
		reveal: { afterUpdate },
		signal: { update: noop },
		nested: { sync: noop, active: () => null },
		attributed: [],
		scroller: () => scroller,
		requestFrame: noop,
		docChanged: noop
	} as unknown as DispatchParts;
	return { cycle: new DispatchCycle(parts), parts, afterUpdate };
}

describe('DispatchCycle', () => {
	it('a selection moved by a pointer drag asks no scroll reveal, any other selection change does', () => {
		const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text('some words'))]);
		const { cycle, parts, afterUpdate } = cycleOn(EditorState.create({ doc }));
		const move = (to: number, drag: boolean) => {
			const tr = parts.fields.state.tr.setSelection(TextSelection.create(doc, to));
			cycle.dispatch(drag ? tr.setMeta(POINTER_DRAG_META, true) : tr);
		};
		move(3, true);
		expect(afterUpdate).not.toHaveBeenCalled();
		move(5, false);
		expect(afterUpdate).toHaveBeenCalledTimes(1);
	});

	it('maps what overlays stand on through a transaction a plugin appended', () => {
		const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text('some words'))]);
		const twice = new Plugin({
			appendTransaction: (trs, _old, now) => (trs.some((tr) => tr.getMeta('typed')) ? now.tr.insertText('!!', 1) : null)
		});
		const { cycle, parts } = cycleOn(EditorState.create({ doc, plugins: [twice] }));
		const end = cycle.tracked.track(6);
		cycle.dispatch(parts.fields.state.tr.insertText('x', 2).setMeta('typed', true));
		expect(parts.fields.state.doc.textContent).toBe('!!sxome words');
		expect(end.from).toBe(9);
	});
});
