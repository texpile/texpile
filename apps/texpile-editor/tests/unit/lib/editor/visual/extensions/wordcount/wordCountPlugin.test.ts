// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { createWordCountPlugin } from '$lib/editor/visual/extensions/wordcount/wordCountPlugin';
import { documentCountStore } from '$lib/stores/countStore.svelte';
import { markdownToProseMirror } from '$lib/languages/markdown/visual/converter';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { parseTypstFile } from '$lib/languages/typst/visual/roundtrip';

describe('the visual word count', () => {
	it('keeps the words on either side of a line break apart', () => {
		const { doc } = markdownToProseMirror('one two\\\nthree four  \nfive\n');
		new EditorView(document.createElement('div'), { state: EditorState.create({ doc, plugins: [createWordCountPlugin()] }) }).destroy();
		expect(documentCountStore.words).toBe(5);
		expect(documentCountStore.charactersWithSpaces).toBe('one two three four five'.length);
	});

	// a Typst paper opens on its set rule selected whole, and read "0 of 114 words" until the first click
	it('counts no selection for a block selected whole that holds no words', () => {
		const { doc } = parseTypstFile('#set page(paper: "a4")\n\nThin films conduct heat.\n');
		expect(doc.firstChild?.type.name).toBe('raw_latex');
		const selection = NodeSelection.create(doc, 0);
		new EditorView(document.createElement('div'), {
			state: EditorState.create({ doc, selection, plugins: [createWordCountPlugin()] })
		}).destroy();
		expect(documentCountStore.selectionWords).toBeNull();
	});

	describe('a selection of many raw blocks', () => {
		afterEach(() => {
			vi.useRealTimers();
			vi.restoreAllMocks();
		});

		// each raw block takes 20 ms of a clock the test owns, so a 30 ms slice reads two of them
		function selectAll(blocks: number): { view: EditorView; select: (from: number, to: number) => void; end: number } {
			let clock = 0;
			vi.spyOn(performance, 'now').mockImplementation(() => clock);
			vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
			const doc = schema.node(
				'doc',
				null,
				Array.from({ length: blocks }, () => schema.node('raw_latex', null, schema.text('\\foo')))
			);
			documentCountStore.selectionWords = null;
			const view = new EditorView(document.createElement('div'), {
				state: EditorState.create({
					doc,
					plugins: [
						createWordCountPlugin(() => {
							clock += 20;
							return 'one two';
						})
					]
				})
			});
			const select = (from: number, to: number) => view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, from, to)));
			return { view, select, end: doc.content.size };
		}

		it('counts in slices and lands once the whole selection is read', () => {
			const { view, select, end } = selectAll(10);
			select(1, end - 1);
			vi.advanceTimersByTime(150);
			expect(documentCountStore.selectionWords).toBeNull();
			vi.advanceTimersByTime(1000);
			expect(documentCountStore.selectionWords).toBe(20);
			view.destroy();
		});

		it('never lands the count of a selection that has since changed', () => {
			const { view, select, end } = selectAll(10);
			select(1, end - 1);
			vi.advanceTimersByTime(150);
			select(1, 1);
			vi.advanceTimersByTime(1000);
			expect(documentCountStore.selectionWords).toBeNull();
			view.destroy();
		});
	});
});
