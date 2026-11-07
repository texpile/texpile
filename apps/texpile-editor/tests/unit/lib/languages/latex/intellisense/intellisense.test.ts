// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { completionStatus, currentCompletions, selectedCompletion } from '@codemirror/autocomplete';
import { latexAutocomplete } from '$lib/languages/latex/intellisense/intellisense';
import { latex } from '$lib/languages/latex/source/latexLanguage';

if (!Range.prototype.getClientRects) Range.prototype.getClientRects = () => [] as unknown as DOMRectList;

const views: EditorView[] = [];

function editor(doc: string, opts: { bib?: boolean } = {}) {
	const view = new EditorView({
		state: EditorState.create({
			doc,
			selection: { anchor: doc.length },
			extensions: [...(opts.bib ? [] : [latex()]), latexAutocomplete(opts)]
		}),
		parent: document.body
	});
	views.push(view);
	return view;
}

const type = (view: EditorView, insert: string) =>
	view.dispatch({
		changes: { from: view.state.selection.main.head, insert },
		selection: { anchor: view.state.selection.main.head + insert.length },
		userEvent: 'input.type'
	});
const backspace = (view: EditorView) => {
	const head = view.state.selection.main.head;
	view.dispatch({ changes: { from: head - 1, to: head }, selection: { anchor: head - 1 }, userEvent: 'delete.backward' });
};
const tab = (view: EditorView) => runScopeHandlers(view, new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9 }), 'editor');
const listed = (view: EditorView) =>
	vi.waitFor(() => {
		expect(completionStatus(view.state)).toBe('active');
		expect(currentCompletions(view.state).length).toBeGreaterThan(0);
	});

afterEach(() => {
	for (const view of views.splice(0)) view.destroy();
});

describe('latexAutocomplete', () => {
	it('takes the selected row on Tab as Enter does, and moves between the fields of a snippet when no list is open', async () => {
		const view = editor('');
		type(view, '\\toprul');
		await listed(view);
		expect(selectedCompletion(view.state)?.label).toBe('\\toprule');
		tab(view);
		expect(view.state.doc.toString()).toBe('\\toprule');

		const frac = editor('$');
		type(frac, '\\fra');
		await vi.waitFor(() => expect(currentCompletions(frac.state).some((c) => c.label === '\\frac')).toBe(true));
		const row = currentCompletions(frac.state).findIndex((c) => c.label === '\\frac');
		for (let i = 0; i < row; i++) runScopeHandlers(frac, new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40 }), 'editor');
		tab(frac);
		expect(frac.state.doc.toString()).toBe('$\\frac{}{}');
		expect(frac.state.selection.main.head).toBe('$\\frac{'.length);
		await vi.waitFor(() => expect(completionStatus(frac.state)).toBeNull());
		tab(frac);
		expect(frac.state.selection.main.head).toBe('$\\frac{}{'.length);
	});

	it('opens the list again when a Backspace leaves the caret in a name, down to the bare backslash', async () => {
		const view = editor('\\textbf');
		backspace(view);
		await listed(view);
		const bare = editor('\\a');
		backspace(bare);
		await listed(bare);
		expect(bare.state.doc.toString()).toBe('\\');
	});

	it('opens the entry types again after a Backspace in a .bib file', async () => {
		const view = editor('@arti', { bib: true });
		backspace(view);
		await listed(view);
	});
});
