// @vitest-environment jsdom
// the rename a label's panel drives: what it does to the references elsewhere in the document
import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { history, undo } from 'prosemirror-history';
import type { EditorView } from 'prosemirror-view';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { readLabelName, setLabelName } from '$lib/languages/latex/visual/plugins/label/node/renameLabel';
import { createTestCanvasView } from '../../../../../../editor/canvas/testing/testCanvasView';

/** a doc holding one label and the references pointing at it */
function makeEditor(labelName: string, refNames: string[], opts: { history?: boolean } = {}) {
	const inline = [
		schema.nodes.label.create({ name: labelName }),
		schema.text(' see '),
		...refNames.map((n) => schema.nodes.ref.create({ refType: 'reference', command: 'ref' }, schema.text(n)))
	];
	const doc = schema.node('doc', null, [schema.node('paragraph', null, inline)]);
	return createTestCanvasView(EditorState.create({ doc, plugins: opts.history ? [history()] : [] })) as unknown as EditorView;
}

/** where the label sits, found rather than assumed */
function labelPos(view: EditorView): number {
	let at = -1;
	view.state.doc.descendants((n, pos) => {
		if (n.type.name === 'label' && at < 0) at = pos;
	});
	return at;
}

function refTexts(view: EditorView): string[] {
	const out: string[] = [];
	view.state.doc.descendants((n) => {
		if (n.type.name === 'ref') out.push(n.textContent);
	});
	return out;
}

describe('renaming a label', () => {
	it('reads a name only from one whole \\label', () => {
		expect(readLabelName('\\label{a:b}')).toBe('a:b');
		expect(readLabelName('\\label{a:b')).toBeNull();
		expect(readLabelName('\\label{}')).toBeNull();
		expect(readLabelName('\\label{a b}')).toBeNull();
	});

	it('takes every reference along in one undo step', () => {
		const view = makeEditor('sec:old', ['sec:old', 'sec:old', 'other:thing'], { history: true });
		setLabelName(view, labelPos(view), 'sec:new');
		expect(refTexts(view)).toEqual(['sec:new', 'sec:new', 'other:thing']);

		undo(view.state, view.dispatch);
		expect(refTexts(view)).toEqual(['sec:old', 'sec:old', 'other:thing']);
		expect(view.state.doc.nodeAt(labelPos(view))?.attrs.name).toBe('sec:old');
		view.destroy();
	});

	// two anchors sharing a name means every reference to it resolves to whichever LaTeX numbered
	// last, and the editor would draw both as valid
	it('refuses a name a figure already holds, rather than merging the two', () => {
		const doc = schema.node('doc', null, [
			schema.node('paragraph', null, [schema.nodes.label.create({ name: 'sec:old' })]),
			schema.nodes.image.create({ src: 'a.png', label: 'fig:taken' })
		]);
		const view = createTestCanvasView(EditorState.create({ doc })) as unknown as EditorView;

		setLabelName(view, labelPos(view), 'fig:taken');
		expect(view.state.doc.nodeAt(labelPos(view))?.attrs.name).toBe('sec:old');
		view.destroy();
	});
});
