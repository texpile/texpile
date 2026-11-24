import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { history, undo, undoDepth } from 'prosemirror-history';
import { GapCursor, gapCursor } from 'prosemirror-gapcursor';
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import type { VisualView } from '$lib/editor/canvas';
import { CompositionState } from '$lib/editor/canvas/interaction/input/compositionState';

const { paragraph, block_math: blockMath } = schema.nodes;

/** a composition over a view that applies what it dispatches and runs the plugins' handleDOMEvents */
function composing(doc: PMNode, selection: (doc: PMNode) => EditorState['selection']) {
	let state = EditorState.create({ doc, selection: selection(doc), plugins: [history(), gapCursor()] });
	const view = {
		get state() {
			return state;
		},
		composing: false,
		dispatch(tr: Transaction) {
			state = state.apply(tr);
		},
		canvas: { nested: () => null }
	} as unknown as VisualView;
	const preedits: ({ from: number; to: number } | null)[] = [];
	const composition = new CompositionState({
		view,
		setComposing: (on) => Object.assign(view, { composing: on }),
		preeditChanged: (range) => preedits.push(range),
		domHandlers: (event) =>
			state.plugins.some((plugin) => {
				const handler = plugin.props.handleDOMEvents?.[event.type as 'beforeinput'];
				return !!handler?.call(plugin, view as unknown as EditorView, event as InputEvent);
			})
	});
	return { composition, view, preedits, state: () => state };
}

describe('CompositionState', () => {
	it('keeps the preedit and the committed text one history step, undone back to the text before', () => {
		const doc = schema.nodes.doc.create(null, [paragraph.create(null, schema.text('ab'))]);
		const ime = composing(doc, (d) => TextSelection.create(d, 2));
		ime.composition.start();
		ime.composition.update('に');
		expect([ime.view.composing, undoDepth(ime.state())]).toEqual([true, 1]);
		ime.composition.update('にほ');
		expect(ime.preedits.at(-1)).toEqual({ from: 2, to: 4 });
		ime.composition.end('日本');
		expect([ime.state().doc.textContent, ime.view.composing, undoDepth(ime.state()), ime.preedits.at(-1)]).toEqual([
			'a日本b',
			false,
			1,
			null
		]);
		undo(ime.state(), (tr) => ime.view.dispatch(tr));
		expect(ime.state().doc.textContent).toBe('ab');
	});

	it('at a gap cursor the paragraph the gap cursor makes takes the preedit', () => {
		const doc = schema.nodes.doc.create(null, [blockMath.create(null, schema.text('x')), blockMath.create(null, schema.text('y'))]);
		const ime = composing(doc, (d) => new GapCursor(d.resolve(3)));
		ime.composition.start();
		ime.composition.update('か');
		ime.composition.end(null);
		expect(ime.state().doc.child(1).type.name).toBe('paragraph');
		expect(ime.state().doc.child(1).textContent).toBe('か');
	});

	it('follows an edit a collaborator makes above the preedit', () => {
		const doc = schema.nodes.doc.create(null, [paragraph.create(null, schema.text('ab cd'))]);
		const ime = composing(doc, (d) => TextSelection.create(d, 4));
		ime.composition.update('に');
		const remote = ime.state().tr.insertText('XY', 1);
		ime.view.dispatch(remote);
		ime.composition.remap(remote.mapping);
		ime.composition.update('にほ');
		ime.composition.end('日本');
		expect(ime.state().doc.textContent).toBe('XYab 日本cd');
	});
});
