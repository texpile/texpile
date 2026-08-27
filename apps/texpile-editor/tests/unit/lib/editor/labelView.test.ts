// @vitest-environment jsdom
// The label node view, and the rename it drives. A real ProseMirror is used for the rename: the
// point of that command is what it does to OTHER nodes in the document, so a stub view would test
// nothing. Mounting is exercised here too, since a node view that throws on construction takes the
// whole editor with it.
import { describe, it, expect } from 'vitest';
import { flushSync } from 'svelte';
import { EditorState } from 'prosemirror-state';
import { history, undo, redo } from 'prosemirror-history';
import { EditorView } from 'prosemirror-view';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { LabelView } from '$lib/languages/latex/visual/extensions/label/labelView.svelte';
import { renameLabel } from '$lib/languages/latex/visual/extensions/label/renameLabel';

/** a doc holding one label and the references pointing at it */
function makeEditor(labelName: string, refNames: string[], opts: { history?: boolean } = {}) {
	const inline = [
		schema.nodes.label.create({ name: labelName }),
		schema.text(' see '),
		...refNames.map((n) => schema.nodes.ref.create({ refType: 'reference', command: 'ref' }, schema.text(n)))
	];
	const doc = schema.node('doc', null, [schema.node('paragraph', null, inline)]);
	const place = document.createElement('div');
	document.body.appendChild(place);
	return new EditorView(place, { state: EditorState.create({ doc, plugins: opts.history ? [history()] : [] }) });
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

describe('the label chip', () => {
	it('mounts and shows the name it carries', () => {
		const node = schema.nodes.label.create({ name: 'sec:methods' });
		const view = new LabelView(node, { state: {} } as unknown as EditorView, () => 0);
		expect(view.dom.textContent).toContain('sec:methods');
		view.destroy();
	});

	// an undo, a collaborator's patch, or a rename driven from another chip all arrive this way
	it('follows the node when the name changes underneath it', () => {
		const node = schema.nodes.label.create({ name: 'sec:a' });
		const view = new LabelView(node, { state: {} } as unknown as EditorView, () => 0);
		view.update(schema.nodes.label.create({ name: 'sec:b' }));
		flushSync();
		expect(view.dom.textContent).toContain('sec:b');
		expect(view.dom.textContent).not.toContain('sec:a');
		view.destroy();
	});
});

describe('renaming a label', () => {
	it('takes every reference to it along, so none is left pointing at nothing', () => {
		const view = makeEditor('sec:old', ['sec:old', 'sec:old', 'other:thing']);
		renameLabel(view, labelPos(view), 'sec:new');

		expect(view.state.doc.nodeAt(labelPos(view))?.attrs.name).toBe('sec:new');
		expect(refTexts(view)).toEqual(['sec:new', 'sec:new', 'other:thing']);
		view.destroy();
	});

	// a rename that took three undos to reverse would leave the document half-renamed in between,
	// with some references pointing at a label that no longer exists
	it('is ONE undo, and puts the references back with it', () => {
		const view = makeEditor('sec:old', ['sec:old', 'sec:old', 'other:thing'], { history: true });
		renameLabel(view, labelPos(view), 'sec:new');
		expect(refTexts(view)).toEqual(['sec:new', 'sec:new', 'other:thing']);

		undo(view.state, view.dispatch);
		expect(view.state.doc.nodeAt(labelPos(view))?.attrs.name).toBe('sec:old');
		expect(refTexts(view)).toEqual(['sec:old', 'sec:old', 'other:thing']);

		redo(view.state, view.dispatch);
		expect(view.state.doc.nodeAt(labelPos(view))?.attrs.name).toBe('sec:new');
		expect(refTexts(view)).toEqual(['sec:new', 'sec:new', 'other:thing']);
		view.destroy();
	});

	it('refuses a name that sanitises to nothing rather than orphaning the references', () => {
		const view = makeEditor('sec:old', ['sec:old']);
		renameLabel(view, labelPos(view), '   ');
		expect(view.state.doc.nodeAt(labelPos(view))?.attrs.name).toBe('sec:old');
		expect(refTexts(view)).toEqual(['sec:old']);
		view.destroy();
	});

	it('strips what a label cannot contain', () => {
		const view = makeEditor('sec:old', ['sec:old']);
		renameLabel(view, labelPos(view), 'sec: my new!');
		expect(view.state.doc.nodeAt(labelPos(view))?.attrs.name).toBe('sec:mynew');
		expect(refTexts(view)).toEqual(['sec:mynew']);
		view.destroy();
	});

	// two anchors sharing a name means every reference to it resolves to whichever LaTeX numbered
	// last, and the editor would draw both as valid
	it('refuses a name a figure already holds, rather than merging the two', () => {
		const doc = schema.node('doc', null, [
			schema.node('paragraph', null, [schema.nodes.label.create({ name: 'sec:old' })]),
			schema.nodes.image.create({ src: 'a.png', label: 'fig:taken' })
		]);
		const place = document.createElement('div');
		document.body.appendChild(place);
		const view = new EditorView(place, { state: EditorState.create({ doc }) });

		renameLabel(view, labelPos(view), 'fig:taken');
		expect(view.state.doc.nodeAt(labelPos(view))?.attrs.name).toBe('sec:old');
		view.destroy();
	});
});
