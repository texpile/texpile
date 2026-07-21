// the remote-cursors plugin: peers render as a caret widget + selection tint,
// and the set rides along with document edits between awareness updates
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { remoteCursorsPlugin, remoteCursorsKey, type RemotePeerSel } from '$lib/editor/extensions/remoteCursors';

const mkState = () => {
	const { doc } = parseLatexFile('Hello world of prose.\n\nSecond paragraph sits here.\n');
	return EditorState.create({ doc, plugins: [remoteCursorsPlugin] });
};

describe('remoteCursorsPlugin', () => {
	it('renders caret and selection for a peer, and clears on empty set', () => {
		let state = mkState();
		const peer: RemotePeerSel = { clientId: 7, name: 'Ada', color: '#f06292', anchor: 3, head: 9 };
		state = state.apply(state.tr.setMeta(remoteCursorsKey, [peer]));
		const set = remoteCursorsKey.getState(state)!;
		expect(set.find(9, 9).length).toBeGreaterThan(0); // caret widget at head
		expect(set.find(3, 9).length).toBeGreaterThanOrEqual(2); // + selection tint
		state = state.apply(state.tr.setMeta(remoteCursorsKey, []));
		expect(remoteCursorsKey.getState(state)!.find().length).toBe(0);
	});

	it('maps the rendered set through local edits between updates', () => {
		let state = mkState();
		state = state.apply(state.tr.setMeta(remoteCursorsKey, [{ clientId: 7, name: 'Ada', color: '#f06292', anchor: 9, head: 9 }]));
		state = state.apply(state.tr.insertText('XY', 1, 1)); // typing before the caret
		const found = remoteCursorsKey.getState(state)!.find();
		expect(found.length).toBe(1);
		expect(found[0].from).toBe(11); // shifted by the two inserted chars
	});
});
