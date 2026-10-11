// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history, undo } from 'prosemirror-history';
import { latexToProseMirror } from '$lib/languages/latex/parser/converter';
import { latexSourceSlice, sliceToLatex } from '$lib/editor/visual/extensions/latexClipboard';
import { visualTextSnippets } from '$lib/editor/snippets/visual/visualTextSnippets';
import { parseSnippetFile } from '$lib/editor/snippets/file/parseSnippetFile';
import { setSnippetLayers } from '$lib/editor/snippets/file/snippetRegistry';

const text = (prefix: string, latex: string, auto = true) => ({ prefix, context: 'text', auto, body: { latex } });
const GLOBAL = JSON.stringify({
	v: 1,
	snippets: {
		'For example': text('eg', 'for example'),
		Emphasis: text('em', '\\emph{$1}', false),
		Integral: { prefix: 'dint', context: 'math', auto: true, body: '\\int' },
		Theorem: text(';th', '\\begin{${1|theorem,lemma|}}$0\\end{$1}'),
		Link: text(';hr', '\\href{${1:https://x.org}}{${2:text}}'),
		Heading: text(';cm', '\\\\${1|section,subsection|}{$2}'),
		Bold: { prefix: '(\\S+)!!', regex: true, auto: true, context: 'text', body: { latex: '\\textbf{[[0]]}' } }
	}
});

let view: EditorView | null = null;

function editor(text: string): EditorView {
	const { doc } = latexToProseMirror(`${text}\n`);
	const state = EditorState.create({ doc, plugins: [history(), visualTextSnippets('latex', latexSourceSlice)] });
	view = new EditorView(document.body, { state });
	view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
	return view;
}

function type(v: EditorView, keys: string): void {
	for (const ch of keys) {
		const { from, to } = v.state.selection;
		if (!v.someProp('handleTextInput', (f) => f(v, from, to, ch, () => v.state.tr))) v.dispatch(v.state.tr.insertText(ch, from, to));
	}
}

function source(v: EditorView): string {
	return sliceToLatex(v.state.doc.slice(0, v.state.doc.content.size));
}

function pressTab(v: EditorView): boolean {
	return v.someProp('handleKeyDown', (f) => f(v, new KeyboardEvent('keydown', { key: 'Tab' }))) ?? false;
}

beforeAll(() => {
	setSnippetLayers({ global: parseSnippetFile(GLOBAL, 'global'), project: null, allowedPatterns: null });
});

afterEach(() => {
	view?.destroy();
	view = null;
});

describe('text snippets in the visual editor', () => {
	it('an auto snippet expands as typed after a citation, and one undo gives the trigger back', () => {
		const v = editor('See \\citep{doe2024} and');
		type(v, ' eg');
		expect(v.state.doc.textContent).toBe('See doe2024 and for example');
		undo(v.state, v.dispatch);
		expect(v.state.doc.textContent).toBe('See doe2024 and eg');
	});

	it('Tab after a trigger reads the body as LaTeX, the caret inside the emphasis', () => {
		const v = editor('See');
		type(v, ' em');
		expect(pressTab(v)).toBe(true);
		type(v, 'this');
		const para = v.state.doc.firstChild!;
		expect(para.textContent).toBe('See this');
		expect(para.child(1).marks.map((mk) => mk.type.name)).toEqual(['em']);
	});

	it('a trigger typed in code stays as typed', () => {
		const v = editor('See \\texttt{x}');
		type(v, ' eg');
		expect(v.state.doc.textContent).toBe('See x eg');
	});

	it('a math snippet stays as typed in a paragraph', () => {
		const v = editor('See');
		type(v, ' dint');
		expect(v.state.doc.textContent).toBe('See dint');
	});

	it('a place used twice starts with the same text in both copies', () => {
		const v = editor('See');
		type(v, ' ;th');
		type(v, 'Q');
		expect(source(v)).toContain('\\begin{theorem}\nQ\n\\end{theorem}');
	});

	it('a first place in a link address leaves nothing in the file, and the link text is selected', () => {
		const v = editor('See');
		type(v, ' ;hr');
		expect(source(v)).toBe('See \\href{https://x.org}{text}');
		const { from, to } = v.state.selection;
		expect(v.state.doc.textBetween(from, to)).toBe('text');
	});

	it('a first place in a command name still reads as that command', () => {
		const v = editor('See');
		type(v, ' ;cm');
		type(v, 'Q');
		expect(source(v)).toBe('See\n\n\\section{Q}');
	});

	it('a pattern capture goes in as the text it was typed as', () => {
		const v = editor('See');
		type(v, ' 50%!!');
		expect(source(v)).toBe('See \\textbf{50\\%}');
	});
});
