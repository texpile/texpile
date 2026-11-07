// @vitest-environment jsdom
// the remote-cursors plugin: peers render as a caret widget + selection tint,
// and the set rides along with document edits between awareness updates
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { buildAnchor } from '$lib/comments/anchor';
import { placePmSuggestions } from '$lib/editor/visual/extensions/pmSuggestionsPlace';
import { pmSuggestions, setPmSuggestions } from '$lib/editor/visual/extensions/pmSuggestions';
import { parseLatexFile, parseLatexRegion } from '$lib/workspace/latexRoundtrip';
import { remoteCursorsPlugin, remoteCursorsKey, setRemoteCursors, type RemotePeerSel } from '$lib/editor/visual/extensions/remoteCursors';

const mkState = () => {
	const { doc } = parseLatexFile('Hello world of prose.\n\nSecond paragraph sits here.\n');
	return EditorState.create({ doc, plugins: [remoteCursorsPlugin] });
};

describe('remoteCursorsPlugin', () => {
	it('renders caret and selection for a peer, and clears on empty set', () => {
		let state = mkState();
		const peer: RemotePeerSel = { clientId: 7, name: 'Ada', color: '#f06292', anchor: 3, head: 9 };
		state = state.apply(state.tr.setMeta(remoteCursorsKey, [peer]));
		const set = remoteCursorsKey.getState(state)!.decos;
		expect(set.find(9, 9).length).toBeGreaterThan(0); // caret widget at head
		expect(set.find(3, 9).length).toBeGreaterThanOrEqual(2); // + selection tint
		state = state.apply(state.tr.setMeta(remoteCursorsKey, []));
		expect(remoteCursorsKey.getState(state)!.decos.find().length).toBe(0);
	});

	// each keystroke published this window's caret, and the render it set off ran every plugin again
	it('dispatches nothing to clear a set that is already empty', () => {
		const view = new EditorView(document.createElement('div'), { state: mkState() });
		let dispatched = 0;
		view.setProps({ dispatchTransaction: (tr) => (dispatched++, view.updateState(view.state.apply(tr))) });
		setRemoteCursors(view, []);
		expect(dispatched).toBe(0);
		setRemoteCursors(view, [{ clientId: 7, name: 'Ada', color: '#f06292', anchor: 3, head: 3 }]);
		setRemoteCursors(view, []);
		expect(dispatched).toBe(2);
		view.destroy();
	});

	it('maps the rendered set through local edits between updates', () => {
		let state = mkState();
		state = state.apply(state.tr.setMeta(remoteCursorsKey, [{ clientId: 7, name: 'Ada', color: '#f06292', anchor: 9, head: 9 }]));
		state = state.apply(state.tr.insertText('XY', 1, 1)); // typing before the caret
		const found = remoteCursorsKey.getState(state)!.decos.find();
		expect(found.length).toBe(1);
		expect(found[0].from).toBe(11); // shifted by the two inserted chars
	});

	// struck words are a widget no decoration reaches, so a peer's selection broke into islands around them
	it('shades the struck words a peer selection runs across', () => {
		const source = 'Refinement is driven by an estimator.\n';
		const parsed = parseLatexFile(source);
		const at = source.indexOf('driven');
		const { ranges } = placePmSuggestions(
			parsed.doc,
			[{ id: 'replace', from: at, to: at + 6, restore: 'led', mine: false, anchor: buildAnchor(source, at, at + 6) }],
			{ text: source, map: parsed.map, body: { from: 0, to: source.length }, parse: (src) => parseLatexRegion(src) }
		);
		const host = document.body.appendChild(document.createElement('div'));
		const view = new EditorView(host, { state: EditorState.create({ doc: parsed.doc, plugins: [pmSuggestions(), remoteCursorsPlugin] }) });
		setPmSuggestions(view, ranges);
		const old = () => view.dom.querySelector<HTMLElement>('.pm-suggest-old')!;

		setRemoteCursors(view, [{ clientId: 7, name: 'Ada', color: '#f06292', anchor: 2, head: 30 }]);
		expect(old().classList.contains('pm-peer-selected')).toBe(true);
		expect(old().style.getPropertyValue('--peer-tint')).toContain('#f06292');

		setRemoteCursors(view, [{ clientId: 7, name: 'Ada', color: '#f06292', anchor: 30, head: 30 }]);
		expect(old().classList.contains('pm-peer-selected')).toBe(false);
		view.destroy();
	});
});
