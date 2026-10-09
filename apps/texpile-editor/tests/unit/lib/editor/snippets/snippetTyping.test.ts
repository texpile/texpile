// @vitest-environment jsdom
// Snippets checked by typing: the keys go in one at a time through the editor's input handlers, as
// a keyboard's do. `|` marks the caret before, and the selection's ends after (`|x|` = x selected).
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { ensureSyntaxTree } from '@codemirror/language';
import { CompletionContext, type Completion } from '@codemirror/autocomplete';
import { typstLanguage } from '$lib/languages/typst/source/typstLanguage';
import { latex } from '$lib/languages/latex/source/latexLanguage';
import { snippetCompletionSource, sourceSnippets } from '$lib/editor/snippets/cmSnippets';
import { parseSnippetFile } from '$lib/editor/snippets/file/parseSnippetFile';
import { setSnippetLayers } from '$lib/editor/snippets/file/snippetRegistry';
import type { SnippetLanguage } from '$lib/editor/snippets/file/snippetTypes';

const GLOBAL = `{
	"v": 1,
	"snippets": {
		"Definite integral": {
			"prefix": "dint", "context": "math", "auto": true,
			"body": {
				"latex": "\\\\int_{\${1:0}}^{\${2:1}} $3 \\\\, \\\\mathrm{d}\${4:x}$0",
				"typst": "integral_(\${1:0})^(\${2:1}) $3 dif \${4:x}$0"
			}
		},
		"Double integral": { "prefix": "iint", "context": "math", "auto": true, "body": { "latex": "\\\\iint", "typst": "integral.double" } },
		"Contour integral": { "prefix": "oint", "context": "math", "auto": true, "body": { "typst": "integral.cont" } },
		"Subscript": { "prefix": "([A-Za-z])(\\\\d)", "regex": true, "auto": true, "context": "math", "body": { "latex": "[[0]]_{[[1]]}", "typst": "[[0]]_[[1]]" } },
		"Display only": { "prefix": "dd", "context": "display-math", "auto": true, "body": "D" },
	}
}`;

let view: EditorView | null = null;
let undoBoundaries: string[] = [];

function editor(lang: SnippetLanguage, withCaret: string): EditorView {
	const at = withCaret.indexOf('|');
	const doc = withCaret.replace('|', '');
	view = new EditorView({
		state: EditorState.create({
			doc,
			selection: { anchor: at },
			extensions: [
				lang === 'typst' ? typstLanguage() : latex(),
				sourceSnippets(lang, { stopUndoCapture: () => undoBoundaries.push(view!.state.doc.toString()) })
			]
		}),
		parent: document.body
	});
	if (lang === 'typst') ensureSyntaxTree(view.state, doc.length, 5000);
	return view;
}

function type(v: EditorView, keys: string): void {
	for (const ch of keys) {
		const { from, to } = v.state.selection.main;
		const handled = v.state
			.facet(EditorView.inputHandler)
			.some((h) => h(v, from, to, ch, () => v.state.update({ changes: { from, to, insert: ch } })));
		if (!handled) v.dispatch({ changes: { from, to, insert: ch }, selection: { anchor: from + 1 }, userEvent: 'input.type' });
		ensureSyntaxTree(v.state, v.state.doc.length, 5000);
	}
}

function shown(v: EditorView): string {
	const { from, to } = v.state.selection.main;
	const doc = v.state.doc.toString();
	return from === to ? `${doc.slice(0, from)}|${doc.slice(from)}` : `${doc.slice(0, from)}|${doc.slice(from, to)}|${doc.slice(to)}`;
}

beforeAll(() => {
	setSnippetLayers({ global: parseSnippetFile(GLOBAL, 'global'), project: null, allowedPatterns: null });
});

afterEach(() => {
	view?.destroy();
	view = null;
	undoBoundaries = [];
});

describe('typing a trigger', () => {
	it.each<[string, SnippetLanguage, string, string, string]>([
		['expands in inline math, first stop selected', 'latex', '$|$', 'dint', '$\\int_{|0|}^{1}  \\, \\mathrm{d}x$'],
		['stays as typed in text', 'latex', 'see |', 'dint', 'see dint|'],
		['stays as typed in \\text{} inside math', 'latex', '$\\text{|}$', 'dint', '$\\text{dint|}$'],
		['stays as typed in a comment', 'latex', '% $|$', 'dint', '% $dint|$'],
		['stays as typed inside a command name', 'latex', '$\\|$', 'iint', '$\\iint|$'],
		['a regex trigger fills its captures', 'latex', '$|$', 'x1', '$x_{1}|$'],
		['display-only stays out of inline math', 'latex', '$|$', 'dd', '$dd|$'],
		['display-only expands in display math', 'latex', '\\[|\\]', 'dd', '\\[D|\\]'],
		['expands in a Typst equation with the Typst body', 'typst', '$ | $', 'dint', '$ integral_(|0|)^(1)  dif x $'],
		['a Typst trigger waits for the start of a word', 'typst', '$ p| $', 'oint', '$ point| $'],
		['stays as typed in Typst markup', 'typst', 'see |', 'dint', 'see dint|'],
		['stays as typed in a Typst string', 'typst', '$ "|" $', 'dint', '$ "dint|" $']
	])('%s', (_, lang, before, keys, after) => {
		const v = editor(lang, before);
		type(v, keys);
		expect(shown(v)).toBe(after);
	});

	it('ends an undo step on the typed trigger, so one undo gives it back', () => {
		const v = editor('latex', '$|$');
		type(v, 'dint');
		expect(undoBoundaries).toEqual(['$dint$']);
	});

	it('a snippet picked from the popup starts at its first stop', () => {
		const v = editor('latex', '$|$');
		type(v, '@/');
		const result = snippetCompletionSource(new CompletionContext(v.state, v.state.selection.main.head, true));
		const option = result!.options.find((o) => o.label === '@/') as Completion & { apply: (...a: unknown[]) => void };
		option.apply(v, option, result!.from, v.state.selection.main.head);
		expect(shown(v)).toBe('$\\frac{|}{}$');
	});
});
