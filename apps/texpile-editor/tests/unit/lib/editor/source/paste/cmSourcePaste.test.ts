// @vitest-environment jsdom
// A table or link Ctrl+V made goes in over the plain text: the first undo leaves the text, in case the
// reading was wrong, and the second takes the paste away.
import { describe, expect, it, vi } from 'vitest';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { latex } from '$lib/languages/latex/source/latexLanguage';
import { typstLanguage } from '$lib/languages/typst/source/typstLanguage';
import { sourcePaste } from '$lib/editor/source/paste/cmSourcePaste';
import { showPasteReadings, type OpenPaste } from '$lib/editor/source/paste/cmPasteAsWidget';
import { showContextMenu } from '$lib/menus/contextMenu.svelte';
import type { PasteDialect } from '$lib/editor/paste/pastedImages';

vi.mock('$lib/menus/contextMenu.svelte', () => ({ showContextMenu: vi.fn(async () => {}) }));

function pasteEvent(text: string): Event {
	const event = new Event('paste', { bubbles: true, cancelable: true });
	const data = { types: ['text/plain'], items: [], getData: (type: string) => (type === 'text/plain' ? text : '') };
	return Object.assign(event, { clipboardData: data });
}

/** `doc` with `text` pasted over `anchor`..`head` */
function pasted(dialect: PasteDialect, language: Extension, doc: string, anchor: number, head: number, text: string): string {
	const state = EditorState.create({
		doc,
		selection: { anchor, head },
		extensions: [language, sourcePaste({ dialect, imageDir: () => null })]
	});
	const view = new EditorView({ state, parent: document.body });
	try {
		view.contentDOM.dispatchEvent(pasteEvent(text));
		return view.state.doc.toString();
	} finally {
		view.destroy();
	}
}

describe('source paste', () => {
	it('puts a converted paste one undo past its plain text', () => {
		const state = EditorState.create({
			doc: 'see the docs',
			selection: { anchor: 4, head: 12 },
			extensions: [history(), sourcePaste({ dialect: 'markdown', imageDir: () => null })]
		});
		const view = new EditorView({ state, parent: document.body });
		try {
			view.contentDOM.dispatchEvent(pasteEvent('https://x.com'));
			expect(view.state.doc.toString()).toBe('see [the docs](https://x.com)');
			undo(view);
			expect(view.state.doc.toString()).toBe('see https://x.com');
			undo(view);
			expect(view.state.doc.toString()).toBe('see the docs');
		} finally {
			view.destroy();
		}
	});

	it('pastes tab-separated text with no HTML as written, a data file as often as a spreadsheet', () => {
		expect(pasted('markdown', markdown(), 'Rows: ', 6, 6, 'a\tb\n1\t2')).toBe('Rows: a\tb\n1\t2');
	});

	it('pastes as written inside code, verbatim and math', () => {
		expect(pasted('markdown', markdown(), '```\n\n```', 4, 4, 'a\tb\n1\t2')).toBe('```\na\tb\n1\t2\n```');
		const verbatim = '\\begin{verbatim}\n\n\\end{verbatim}';
		expect(pasted('latex', latex(), verbatim, 17, 17, 'a\tb\n1\t2')).toBe('\\begin{verbatim}\na\tb\n1\t2\n\\end{verbatim}');
		expect(pasted('latex', latex(), 'see $x + y$', 5, 10, 'https://x.com')).toBe('see $https://x.com$');
		expect(pasted('latex', latex(), 'see the docs', 4, 12, 'https://x.com')).toBe('see \\href{https://x.com}{the docs}');
		expect(pasted('typst', typstLanguage(), 'see `the docs`', 5, 13, 'https://x.com')).toBe('see `https://x.com`');
	});

	it('lets a Paste As pick do nothing once the text has changed under it', () => {
		const view = new EditorView({ state: EditorState.create({ doc: 'Hello world' }), parent: document.body });
		try {
			const paste: OpenPaste = {
				from: 6,
				to: 11,
				current: 'plain',
				readings: [
					{ kind: 'plain', label: 'Plain', text: 'world' },
					{ kind: 'link', label: 'Link', text: '[world](https://x.com)' }
				]
			};
			showPasteReadings(view, paste, { x: 0, y: 0 });
			const [items] = vi.mocked(showContextMenu).mock.calls.at(-1)!;
			view.dispatch({ changes: { from: 0, insert: 'Oh, ' } });
			(items[0] as { onclick: () => void }).onclick();
			expect(view.state.doc.toString()).toBe('Oh, Hello world');
		} finally {
			view.destroy();
		}
	});
});
