// @vitest-environment jsdom
// One file in two groups: the parked editor takes the focused one's document by the smallest replace,
// which a patch marked as a collaborator's keeps out of its own history
import { describe, expect, it } from 'vitest';
import { Schema, type Node as PMNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history, undoDepth } from 'prosemirror-history';
import { patchToDoc } from '$lib/workspace/groups/liveDocFollow';

const schema = new Schema({ nodes: { doc: { content: 'paragraph+' }, paragraph: { content: 'text*', toDOM: () => ['p', 0] }, text: {} } });
const doc = (...paras: string[]): PMNode =>
	schema.node(
		'doc',
		null,
		paras.map((p) => schema.node('paragraph', null, p ? [schema.text(p)] : []))
	);

describe('patchToDoc', () => {
	it('turns the parked document into the focused one, repeated letters and all, without an undo step', () => {
		const view = new EditorView(document.createElement('div'), {
			state: EditorState.create({ doc: doc('Thin films', 'aaa'), plugins: [history()] })
		});
		const next = doc('Thin new films', 'aaaa', 'More.');
		patchToDoc(view, next);
		expect(view.state.doc.eq(next)).toBe(true);
		expect(undoDepth(view.state)).toBe(0);
		view.destroy();
	});
});
