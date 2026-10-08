// @vitest-environment jsdom
// A parked editor follows its file wherever it changes: the focused editor's document by the smallest
// replace, which a patch marked as a collaborator's keeps out of its own history, and text from anywhere
// else through one parse, the newest text only
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Schema, type Node as PMNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history, undoDepth } from 'prosemirror-history';
import { followFile, forgetFilesBut, patchToDoc, publishFile, setFileParser } from '$lib/workspace/groups/fileFeed.svelte';
import { emptyMap } from '$lib/editor/visual/sourceSpans';

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

describe('followFile', () => {
	afterEach(() => {
		vi.useRealTimers();
		setFileParser(null);
		forgetFilesBut(new Set());
	});

	it('patches a parked view with the newest text from elsewhere, parsed once', async () => {
		vi.useFakeTimers();
		const parsed: string[] = [];
		setFileParser(async (_path, text) => {
			parsed.push(text);
			return { doc: doc(...text.split('\n')), map: emptyMap(), meta: null };
		});
		const view = new EditorView(document.createElement('div'), { state: EditorState.create({ doc: doc('one') }) });
		const stop = followFile('/w/a.tex', () => view);
		publishFile('/w/a.tex', 'one\ntw');
		publishFile('/w/a.tex', 'one\ntwo');
		await vi.runAllTimersAsync();
		expect(parsed).toEqual(['one\ntwo']);
		expect(view.state.doc.eq(doc('one', 'two'))).toBe(true);
		// the focused editor's own document goes across with no parse
		publishFile('/w/a.tex', 'one\ntwo\nthree', { doc: doc('one', 'two', 'three'), map: emptyMap(), meta: null });
		expect(view.state.doc.eq(doc('one', 'two', 'three'))).toBe(true);
		expect(parsed).toHaveLength(1);
		stop();
		view.destroy();
	});
});
