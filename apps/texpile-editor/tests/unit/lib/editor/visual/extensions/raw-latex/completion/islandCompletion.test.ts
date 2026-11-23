// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { islandCompletionPlugin } from '$lib/editor/visual/extensions/raw-latex/completion/islandCompletion';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { createTestCanvasView } from '../../../../canvas/testing/testCanvasView';

function rawBlock(text: string): EditorView {
	const doc = schema.nodes.doc.create(null, [schema.nodes.raw_latex.create(null, schema.text(text))]);
	const state = EditorState.create({ doc, plugins: [islandCompletionPlugin()] });
	return createTestCanvasView(
		state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1 + text.length)))
	) as unknown as EditorView;
}

function type(view: EditorView, text: string): void {
	const { from, to } = view.state.selection;
	const tr = () => view.state.tr.insertText(text, from, to);
	if (!view.someProp('handleTextInput', (f) => f(view, from, to, text, tr))) view.dispatch(tr());
}

function press(view: EditorView, key: string): boolean {
	return !!view.someProp('handleKeyDown', (handle) => handle(view, new KeyboardEvent('keydown', { key })));
}

async function menu(): Promise<HTMLElement> {
	for (let i = 0; i < 50; i++) {
		const found = document.querySelector<HTMLElement>('.island-completion');
		if (found?.querySelector('[role=option]')) return found;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error('no completion list');
}

afterEach(() => document.querySelector('.island-completion')?.remove());

it('typing a command in a raw block lists the commands it can be, and Enter takes one with its argument', async () => {
	const view = rawBlock('\\sectio');
	type(view, 'n');
	const options = [...(await menu()).querySelectorAll('[role=option]')].map((el) => el.textContent?.trim());
	expect(options.some((label) => label?.startsWith('\\section'))).toBe(true);
	for (
		let i = 0;
		i < options.length && !document.querySelector('[aria-selected=true]')?.textContent?.trim().startsWith('\\section{');
		i++
	) {
		press(view, 'ArrowDown');
		flushSync();
	}
	expect(press(view, 'Enter')).toBe(true);
	expect(view.state.doc.textContent).toBe('\\section{}');
	expect(view.state.selection.from).toBe(1 + '\\section{'.length);
	expect(document.querySelector('.island-completion')).toBeNull();
});

it('Tab goes to the next argument of a command just taken from the list', async () => {
	const view = rawBlock('\\setlengt');
	type(view, 'h');
	const options = [...(await menu()).querySelectorAll('[role=option]')];
	for (
		let i = 0;
		i < options.length && !document.querySelector('[aria-selected=true]')?.textContent?.trim().startsWith('\\setlength{');
		i++
	) {
		press(view, 'ArrowDown');
		flushSync();
	}
	press(view, 'Enter');
	expect(view.state.doc.textContent).toBe('\\setlength{}{}');
	type(view, 'a');
	expect(press(view, 'Tab')).toBe(true);
	expect(view.state.selection.from).toBe(1 + '\\setlength{a}{'.length);
});
