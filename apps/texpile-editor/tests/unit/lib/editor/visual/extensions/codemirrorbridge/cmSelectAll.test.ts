// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState as CMState } from '@codemirror/state';
import { EditorView as CMView } from '@codemirror/view';
import { AllSelection, EditorState } from 'prosemirror-state';
import { Schema } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { selectAllThenDocument } from '$lib/editor/visual/extensions/codemirrorbridge/cmSelectAll';

const schema = new Schema({ nodes: { doc: { content: 'block+' }, block: { content: 'text*', group: 'block' }, text: {} } });

describe('selectAllThenDocument', () => {
	it('takes the code first and the whole document on the second press', () => {
		const pm = {
			state: EditorState.create({ doc: schema.node('doc', null, [schema.node('block', null, [schema.text('x')])]) }),
			focus: () => {}
		};
		const view = { ...pm, dispatch: (tr: unknown) => (pm.state = pm.state.apply(tr as never)) } as unknown as EditorView;
		const cm = new CMView({ state: CMState.create({ doc: 'first line\nsecond line', selection: { anchor: 3 } }), parent: document.body });
		const run = selectAllThenDocument(view).run!;
		run(cm);
		expect([cm.state.selection.main.from, cm.state.selection.main.to]).toEqual([0, cm.state.doc.length]);
		expect(pm.state.selection instanceof AllSelection).toBe(false);
		run(cm);
		expect(pm.state.selection instanceof AllSelection).toBe(true);
	});
});
