// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { openSearchPanel, getSearchQuery } from '@codemirror/search';
import { texpileSearch } from '$lib/editor/source/extensions/search-panel/searchPanel.svelte';

const DOC = 'alpha Alpha alphabet\nbeta\nalpha';

let view: EditorView;

function open(doc = DOC): EditorView {
	const parent = document.createElement('div');
	document.body.appendChild(parent);
	view = new EditorView({ state: EditorState.create({ doc, extensions: [texpileSearch()] }), parent });
	openSearchPanel(view);
	return view;
}

function queryField(): HTMLInputElement {
	const el = view.dom.parentElement?.querySelector<HTMLInputElement>('.find-field input');
	if (!el) throw new Error('find bar did not render');
	return el;
}

function toggle(label: string): HTMLButtonElement {
	const found = [...(view.dom.parentElement?.querySelectorAll<HTMLButtonElement>('.find-toggle') ?? [])].find(
		(b) => b.textContent?.trim() === label
	);
	if (!found) throw new Error(`no ${label} toggle`);
	return found;
}

function type(text: string): void {
	const field = queryField();
	field.value = text;
	field.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => (document.body.innerHTML = ''));
afterEach(() => view?.destroy());

describe('source search panel', () => {
	it('renders the shared find bar with all three options', () => {
		open();
		expect(queryField()).toBeTruthy();
		expect(['Aa', 'ab', '.*'].map((l) => toggle(l).textContent?.trim())).toEqual(['Aa', 'ab', '.*']);
	});

	it('publishes what is typed as CodeMirror search state', () => {
		open();
		type('alpha');
		expect(getSearchQuery(view.state).search).toBe('alpha');
	});

	it('carries each toggle into the query CodeMirror runs', () => {
		open();
		type('alpha');

		toggle('Aa').click();
		expect(getSearchQuery(view.state).caseSensitive).toBe(true);

		toggle('ab').click();
		expect(getSearchQuery(view.state).wholeWord).toBe(true);

		toggle('.*').click();
		expect(getSearchQuery(view.state).regexp).toBe(true);
	});

	it('keeps the query when the panel is reopened', () => {
		open();
		type('beta');
		toggle('Aa').click();

		openSearchPanel(view); // already open: CM re-focuses rather than rebuilding
		expect(queryField().value).toBe('beta');
		expect(getSearchQuery(view.state).caseSensitive).toBe(true);
	});

	it('reports how many matches there are, and none for a term that is absent', async () => {
		open();
		const status = view.dom.parentElement?.querySelector('[aria-live]');
		await tick();
		expect(status?.textContent?.trim()).toBeTruthy();
		expect(status?.textContent).not.toMatch(/[1-9]/);

		// four: case-insensitive and matching inside words, so Alpha and alphabet count
		type('alpha');
		await tick();
		expect(status?.textContent).toMatch(/4/);

		type('gamma');
		await tick();
		expect(status?.textContent).toBeTruthy();
		expect(status?.textContent).not.toMatch(/[1-9]/);
	});
});
