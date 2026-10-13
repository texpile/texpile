// @vitest-environment jsdom
// `|` marks the caret before, and the selection's ends after (`|x|` = x selected)
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { ensureSyntaxTree } from '@codemirror/language';
import { CompletionContext, snippet, type Completion } from '@codemirror/autocomplete';
import { cursorCharRight, cursorLineDown } from '@codemirror/commands';
import { typstLanguage } from '$lib/languages/typst/source/typstLanguage';
import { latex } from '$lib/languages/latex/source/latexLanguage';
import { snippetCompletionSource, sourceSnippets } from '$lib/editor/snippets/cmSnippets';
import { expandSnippet } from '$lib/editor/snippets/expand/expandSnippet';
import { inSnippet } from '$lib/editor/snippets/expand/snippetSession';
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
		"Strong": { "scope": "typst", "key": "Mod-Alt-s", "body": "*\${TM_SELECTED_TEXT}*$0" },
		"Emphasis": { "scope": "latex", "key": "Mod-Alt-e", "body": "\\\\emph{\${TM_SELECTED_TEXT}}$0" },
		"Theorem": { "prefix": "thm", "context": "text", "auto": true, "body": { "latex": "\\\\begin{\${1|theorem,lemma|}}\\n$0\\n\\\\end{$1}" } },
		"Pair": { "prefix": "pr", "context": "text", "auto": true, "body": { "latex": "\${1:a}-$1" } },
	}
}`;

let view: EditorView | null = null;
let undoBoundaries: string[] = [];

function editor(lang: SnippetLanguage, withCaret: string): EditorView {
	const at = withCaret.indexOf('|');
	const end = withCaret.indexOf('|', at + 1);
	const doc = withCaret.replaceAll('|', '');
	view = new EditorView({
		state: EditorState.create({
			doc,
			selection: { anchor: at, head: end < 0 ? at : end - 1 },
			extensions: [
				EditorState.allowMultipleSelections.of(true),
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
		['stays as typed inside an @ name', 'latex', '$|$', '@x1', '$@x1|$'],
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

	it('Tab reaches each later stop, past the braces before it', () => {
		const v = editor('latex', '$|$');
		type(v, 'dint');
		v.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
		expect(shown(v)).toBe('$\\int_{0}^{|1|}  \\, \\mathrm{d}x$');
	});

	it.each([
		['a choice', 'thm', '\\begin{theorem}\n\n\\end{theorem}', 'lemma', '\\begin{lemma}\n\n\\end{lemma}'],
		['a default', 'pr', 'a-a', 'b', 'b-b']
	])('a place used twice starts with %s in both, and what is typed goes in both', (_, keys, expanded, typed, after) => {
		const v = editor('latex', '|');
		type(v, keys);
		expect(v.state.doc.toString()).toBe(expanded);
		v.dispatch(v.state.replaceSelection(typed));
		expect(v.state.doc.toString()).toBe(after);
	});

	it.each([
		['moving out of it', (v: EditorView) => cursorCharRight(v) && cursorCharRight(v)],
		[
			'Escape',
			(v: EditorView) => v.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
		]
	])('a place used twice leaves one cursor on %s', (_, leave) => {
		const v = editor('latex', '|');
		type(v, 'thm');
		expect(v.state.selection.ranges).toHaveLength(2);
		leave(v);
		expect(v.state.selection.ranges).toHaveLength(1);
	});

	it('Tab out of a place leaves the cursor after a transformed copy at the end, not on it', () => {
		const v = editor('latex', '|');
		expandSnippet(v, [{ body: '[$1]${1/(.*)/${1:?full:empty}/}', from: 0, to: 0, selection: '' }]);
		v.dispatch(v.state.replaceSelection('a'));
		v.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
		expect(shown(v)).toBe('[a]full|');
	});

	it('ends the snippet when an undo takes it back out, as vs code does', () => {
		const v = editor('latex', '|');
		type(v, 'pr');
		v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: 'pr' }, selection: { anchor: 2 } });
		expect(inSnippet(v.state)).toBe(false);
	});

	it('keeps a cursor at each spot a snippet went in at, as vs code does', () => {
		const v = editor('latex', '|');
		v.dispatch({
			changes: { from: 0, insert: '\n' },
			selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(1)])
		});
		expandSnippet(
			v,
			[0, 1].map((from) => ({ body: '${1:a}-$1', from, to: from, selection: '' }))
		);
		cursorLineDown(v);
		expect(v.state.selection.ranges.length).toBeGreaterThan(1);
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

	it('ends an undo step on the prefix before a snippet from the popup goes in', () => {
		const v = editor('latex', '$|$');
		type(v, '@/');
		const result = snippetCompletionSource(new CompletionContext(v.state, v.state.selection.main.head, true));
		const option = result!.options.find((o) => o.label === '@/') as Completion & { apply: (...a: unknown[]) => void };
		option.apply(v, option, result!.from, v.state.selection.main.head);
		expect(undoBoundaries).toEqual(['$@/$']);
	});
});

/** Ctrl and Alt with a letter: a snippet's `key` */
function pressKey(v: EditorView, letter: string): void {
	v.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: letter, ctrlKey: true, altKey: true, bubbles: true, cancelable: true }));
}

describe('a snippet run from its key takes the selection in', () => {
	it.each<[string, SnippetLanguage, string, string, string]>([
		['in LaTeX', 'latex', 'e', 'Check |this part| now.', 'Check \\emph{this part}| now.'],
		['in Typst', 'typst', 's', 'Check |this part| now.', 'Check *this part*| now.'],
		['refused when it would split a piece of markup', 'typst', 's', 'Check *bo|ld* and| more.', 'Check *bo|ld* and| more.'],
		['refused when it would split a brace group', 'latex', 'e', '\\textbf{bo|ld} and| more.', '\\textbf{bo|ld} and| more.']
	])('%s', (_, lang, letter, before, after) => {
		const v = editor(lang, before);
		pressKey(v, letter);
		expect(shown(v)).toBe(after);
	});

	it("Tab still moves through codemirror's own completion snippets, which keep their own session", () => {
		const v = editor('latex', '|');
		snippet('\\begin{${1:env}}\n${2}\n\\end{${1:env}}')(v, null, 0, 0);
		v.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
		expect(shown(v)).toBe('\\begin{env}\n|\n\\end{env}');
	});

	it('takes in every selection', () => {
		const v = editor('latex', '|aa| bb cc');
		v.dispatch({ selection: EditorSelection.create([EditorSelection.range(0, 2), EditorSelection.range(6, 8)]) });
		pressKey(v, 'e');
		expect(v.state.doc.toString()).toBe('\\emph{aa} bb \\emph{cc}');
	});
});
