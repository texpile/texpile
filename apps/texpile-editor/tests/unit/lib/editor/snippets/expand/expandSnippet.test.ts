// @vitest-environment jsdom
// `|` is a cursor and `[x]` a selected x, in every selection range
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { sourceSnippets } from '$lib/editor/snippets/cmSnippets';
import { expandSnippet } from '$lib/editor/snippets/expand/expandSnippet';
import { BodyReader, plainText } from '$lib/editor/snippets/expand/body/bodyNodes';
import { setSnippetEnvironment } from '$lib/editor/snippets/expand/body/bodyVariables';

if (!Range.prototype.getClientRects) Range.prototype.getClientRects = () => [] as unknown as DOMRectList;

let view: EditorView | null = null;

afterEach(() => {
	view?.destroy();
	view = null;
	setSnippetEnvironment(() => ({ filePath: null, folder: null }));
});

/** expands `body` where `|` is, over [from, to] when a selection is given */
function expanded(doc: string, body: string, selection?: [number, number]): EditorView {
	const at = doc.indexOf('|');
	const text = doc.replace('|', '');
	const [from, to] = selection ?? [at, at];
	view = new EditorView({
		state: EditorState.create({ doc: text, extensions: [EditorState.allowMultipleSelections.of(true), sourceSnippets('latex')] }),
		parent: document.body
	});
	expandSnippet(view, [{ body, from, to, selection: text.slice(from, to) }]);
	return view;
}

function shown(v: EditorView): string {
	const doc = v.state.doc.toString();
	let out = '';
	let at = 0;
	for (const r of v.state.selection.ranges) {
		out += doc.slice(at, r.from) + (r.empty ? '|' : `[${doc.slice(r.from, r.to)}]`);
		at = r.to;
	}
	return out + doc.slice(at);
}

function tab(v: EditorView): string {
	v.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
	return shown(v);
}

describe('indentation', () => {
	it('body lines take the line indentation and leave nothing behind', () => {
		const v = expanded('        |', '\\\\begin{itemize}\n\t\\\\item $0\n\\\\end{itemize}');
		expect(shown(v)).toBe('        \\begin{itemize}\n          \\item |\n        \\end{itemize}');
	});

	it('line breaks inside a default are indented like body lines', () => {
		expect(shown(expanded('    |', 'x\n\t${1:a\n\tb}'))).toBe('    x\n      [a\n      b]');
	});

	it('a selection over lines keeps its own indentation, plus what the body adds', () => {
		const quote = '\\\\begin{quote}\n\t${TM_SELECTED_TEXT}\n\\\\end{quote}';
		expect(shown(expanded('  foo\n  bar', quote, [2, 11]))).toBe('  \\begin{quote}\n    foo\n    bar\n  \\end{quote}|');
		expect(shown(expanded('    foo\n\tbar', '\\\\emph{${TM_SELECTED_TEXT}}$0', [4, 12]))).toBe('    \\emph{foo\n\tbar}|');
	});
});

describe('places', () => {
	it.each([
		['${1:outer ${2:inner}} end', ['[outer inner] end', 'outer [inner] end', 'outer inner end|']],
		['${1:\\\\begin{${2:env}\\}} x', ['[\\begin{env}] x', '\\begin{[env]} x', '\\begin{env} x|']],
		['${1:a $0 b} c', ['[a  b] c', 'a | b c']],
		['[${TM_SELECTED_TEXT:${1:x}}]', ['[[x]]', '[x]|']]
	])('%s visits a place inside a place after it', (body, steps) => {
		const v = expanded('|', body);
		expect([shown(v), ...steps.slice(1).map(() => tab(v))]).toEqual(steps);
	});

	it('a place typed over takes the places inside it along', () => {
		const v = expanded('|', '${1:outer ${2:inner}} end');
		v.dispatch(v.state.replaceSelection('X'));
		expect(tab(v)).toBe('X end|');
	});

	it('a copy inside another place starts with the default and changes with it', () => {
		const v = expanded('|', '${2:a $1 b} ${1:x}');
		expect(shown(v)).toBe('a [x] b [x]');
		v.dispatch(v.state.replaceSelection('y'));
		expect(tab(v)).toBe('[a y b] y');
	});

	it.each([
		['${1:a} ${1:b}', '[a] [a]'],
		['${1|a,b|} ${1|c,d|}', '[a] [a]']
	])('the first copy with a default sets every copy: %s', (body, after) => {
		expect(shown(expanded('|', body))).toBe(after);
	});
});

describe('variables and transforms', () => {
	it('fills file, folder and comment variables; an unknown one becomes a place', () => {
		setSnippetEnvironment(() => ({ filePath: '/u/thesis/ch/intro.tex', folder: '/u/thesis' }));
		const body = '$TM_FILENAME_BASE $RELATIVE_FILEPATH $WORKSPACE_NAME $LINE_COMMENT ${CLIPBOARD:none} $foo';
		expect(shown(expanded('|', body))).toBe('intro ch/intro.tex thesis % none [foo]');
		const inputs = { selection: '', captures: [] };
		expect(plainText(new BodyReader('$TM_FILENAME', inputs).readNodes(false), inputs)).toBe('intro.tex');
	});

	it('a variable transform applies at once', () => {
		setSnippetEnvironment(() => ({ filePath: '/u/paper.tex', folder: '/u' }));
		expect(shown(expanded('|', '${TM_FILENAME/(.*)\\..+$/$1/}'))).toBe('paper|');
	});

	it('a transformed copy of a place changes when the place is left', () => {
		const v = expanded('|', '${1:foo} ${1/(.*)/${1:/upcase}/}');
		expect(shown(v)).toBe('[foo] [foo]');
		v.dispatch(v.state.replaceSelection('bar'));
		expect(tab(v)).toBe('bar BAR|');
	});
});
