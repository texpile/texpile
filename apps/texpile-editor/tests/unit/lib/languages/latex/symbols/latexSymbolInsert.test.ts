// How a picked LaTeX symbol is written: in the mode it needs where the caret is, never run into the
// text after it, and in the visual editor as a formula or a chip that writes the same source. The
// \usepackage it needs goes after the preamble's last one when the offer is taken.
import { describe, expect, it, vi } from 'vitest';
import { EditorState as CMState, EditorSelection } from '@codemirror/state';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { computeLatexSymbolInsert, insertLatexSymbolVisual } from '$lib/languages/latex/symbols/latexSymbolInsert';
import {
	loadsPackageFor as loadsWith,
	offerPackageFor,
	openTexFile,
	usepackageFor,
	withUsepackage
} from '$lib/languages/latex/symbols/latexSymbolPackage';
import { filePackageNames } from '$lib/languages/latex/intellisense/packages/loadedPackages';

const loadsPackageFor = async (text: string, symbol: { command?: string; package: string; fontenc: string }) =>
	loadsWith(text, { command: '', ...symbol }, await filePackageNames(text));
import { toaster } from '$lib/modals/toaster-svelte';
import { latexSymbolById } from '$lib/languages/latex/symbols/latexSymbols';

const ALPHA = latexSymbolById('latex2e-OT1-_alpha')!;
const SECTION = latexSymbolById('latex2e-OT1-_S')!;
const BULLET = latexSymbolById('latex2e-OT1-_textbullet')!;
const SQRT = latexSymbolById('latex2e-OT1-_sqrt{}')!;

/** `source` with `|` for the caret, after `symbol` is inserted there */
function insertInSource(source: string, symbol: typeof ALPHA): string {
	const at = source.indexOf('|');
	const state = CMState.create({ doc: source.slice(0, at) + source.slice(at + 1), selection: EditorSelection.cursor(at) });
	const tr = state.update(computeLatexSymbolInsert(state, symbol));
	const caret = tr.state.selection.main.head;
	const text = tr.state.doc.toString();
	return text.slice(0, caret) + '|' + text.slice(caret);
}

describe('computeLatexSymbolInsert', () => {
	it('puts a math symbol in $...$ in text and bare in math, parted from a letter after it', () => {
		expect(insertInSource('Let | be', ALPHA)).toBe('Let $\\alpha$| be');
		expect(insertInSource('$x + |$', ALPHA)).toBe('$x + \\alpha|$');
		expect(insertInSource('$|x$', ALPHA)).toBe('$\\alpha |x$');
		expect(insertInSource('\\[ |a \\]', SQRT)).toBe('\\[ \\sqrt{|}a \\]');
	});

	it('joins a math symbol to the formula it is typed against, never writing $$', () => {
		expect(insertInSource('Then $a$| b', ALPHA)).toBe('Then $a\\alpha$| b');
		expect(insertInSource('Then |$x$', ALPHA)).toBe('Then $\\alpha |x$');
		expect(insertInSource('costs \\$|5', ALPHA)).toBe('costs \\$$\\alpha$|5');
	});

	it('keeps the caret in the braces when joining a formula', () => {
		expect(insertInSource('Then $x$|', SQRT)).toBe('Then $x\\sqrt{|}$');
	});

	it('writes a formula inside a text argument in math', () => {
		expect(insertInSource('$a \\text{ for all | }$', ALPHA)).toBe('$a \\text{ for all $\\alpha$| }$');
		expect(insertInSource('\\[ \\mbox{if |} \\]', ALPHA)).toBe('\\[ \\mbox{if $\\alpha$|} \\]');
		expect(insertInSource('$\\text{a} |$', ALPHA)).toBe('$\\text{a} \\alpha|$');
		expect(insertInSource('$a \\emph{ if | }$', ALPHA)).toBe('$a \\emph{ if $\\alpha$| }$');
	});

	it('ends a text command with {} so the space after it stays, and boxes it in math', async () => {
		expect(insertInSource('See | 2', SECTION)).toBe('See \\S{}| 2');
		expect(insertInSource('$a|$', BULLET)).toBe('$a\\mbox{\\textbullet}|$');
		// what the document loads is read when it opens; mathtools brings amsmath
		await filePackageNames('\\usepackage{mathtools}\n$a$');
		expect(insertInSource('\\usepackage{mathtools}\n$a|$', BULLET)).toBe('\\usepackage{mathtools}\n$a\\text{\\textbullet}|$');
	});
});

/** just enough of an EditorView: dispatch applies, focus does nothing */
function fakeView(state: EditorState): EditorView & { state: EditorState } {
	const view = {
		state,
		dispatch(tr: Transaction) {
			view.state = view.state.apply(tr);
		},
		focus() {}
	};
	return view as unknown as EditorView & { state: EditorState };
}

function endOf(doc: PMNode, text: string): number {
	let found = -1;
	doc.descendants((node, pos) => {
		if (found < 0 && node.isText && node.text!.includes(text)) found = pos + node.text!.indexOf(text) + text.length;
	});
	return found;
}

describe('the visual editor and the preamble', () => {
	it('writes a formula for a math symbol and a chip for a text one', () => {
		const parsed = parseLatexFile('\\documentclass{article}\n\\begin{document}\nOne two\n\\end{document}\n');
		const view = fakeView(EditorState.create({ doc: parsed.doc, selection: TextSelection.create(parsed.doc, endOf(parsed.doc, 'One')) }));
		insertLatexSymbolVisual(view, ALPHA);
		insertLatexSymbolVisual(view, SECTION);
		expect(serializeLatexFile(parsed, view.state.doc)).toContain('One$\\alpha$\\S{} two');
	});

	it('adds the \\usepackage after the last one, and sees one loaded through another', async () => {
		const tex = '\\documentclass{article}\n\\usepackage{graphicx}\n\\usepackage[T1]{fontenc}\n\\begin{document}\nx\n\\end{document}\n';
		expect(withUsepackage(tex, '\\usepackage{amssymb}')).toBe(
			'\\documentclass{article}\n\\usepackage{graphicx}\n\\usepackage[T1]{fontenc}\n\\usepackage{amssymb}\n\\begin{document}\nx\n\\end{document}\n'
		);
		expect(withUsepackage('\\documentclass{article}\n\\begin{document}\n', '\\usepackage{amssymb}')).toBe(
			'\\documentclass{article}\n\\usepackage{amssymb}\n\\begin{document}\n'
		);
		expect(await loadsPackageFor(tex, { package: '', fontenc: 'T1' })).toBe(true);
		expect(await loadsPackageFor('\\usepackage{mathtools}', { package: 'amsmath', fontenc: '' })).toBe(true);
		expect(await loadsPackageFor(tex, { command: '\\textbullet', package: 'textcomp', fontenc: '' })).toBe(true);
		expect(await loadsPackageFor(tex, { command: '\\mathcal{A}', package: 'amssymb', fontenc: '' })).toBe(true);
		expect(await loadsPackageFor(tex, { package: 'amssymb', fontenc: '' })).toBe(false);
	});

	it('needs a package only for what the kernel does not define', () => {
		const needs = (id: string) => usepackageFor(latexSymbolById(id)!);
		expect(needs('amssymb-OT1-_subsetneq')).toBe('\\usepackage{amssymb}');
		expect(needs('amssymb-OT1-_hbar')).toBeNull();
		expect(needs('amssymb-OT1-_mathcal{A}')).toBeNull();
		expect(needs('textcomp-OT1-_textbullet')).toBeNull();
	});

	it('puts the \\usepackage before \\begin{document} on the same line', () => {
		expect(withUsepackage('\\documentclass{article}\\usepackage{x}\\begin{document}\n', '\\usepackage{amssymb}')).toBe(
			'\\documentclass{article}\\usepackage{x}\n\\usepackage{amssymb}\n\\begin{document}\n'
		);
	});

	it('does not count a package that is commented out', async () => {
		expect(await loadsPackageFor('\\documentclass{article}\n% \\usepackage{amssymb}\n', { package: 'amssymb', fontenc: '' })).toBe(false);
		expect(await loadsPackageFor('%\\usepackage[T1]{fontenc}\n', { package: '', fontenc: 'T1' })).toBe(false);
		expect(await loadsPackageFor('\\usepackage{amssymb} % 100\\% sure\n', { package: 'amssymb', fontenc: '' })).toBe(true);
	});

	it('offers nothing once the editor holds another file', async () => {
		const preamble = '\\documentclass{article}\n\\begin{document}\n';
		let path = 'a.tex';
		openTexFile.current = { path: () => path, text: () => preamble, edit: async () => true };
		const info = vi.spyOn(toaster, 'info').mockImplementation(() => '');
		offerPackageFor({ command: '\\mathbb', package: 'amssymb', fontenc: '' });
		path = 'b.tex';
		await filePackageNames(preamble);
		await new Promise((r) => setTimeout(r, 0));
		expect(info).not.toHaveBeenCalled();
		info.mockRestore();
		openTexFile.current = null;
	});

	it('adds the offered package only to the file it was offered for', async () => {
		const preamble = '\\documentclass{article}\n\\begin{document}\n';
		let path = 'a.tex';
		const edits: string[] = [];
		openTexFile.current = { path: () => path, text: () => preamble, edit: async (_, next) => (edits.push(next), true) };
		const info = vi.spyOn(toaster, 'info').mockImplementation(() => '');
		offerPackageFor({ command: '\\mathbb', package: 'amssymb', fontenc: '' });
		await vi.waitFor(() => expect(info).toHaveBeenCalled());
		const click = () => info.mock.calls[0][0].action?.onClick?.();
		path = 'b.tex';
		click();
		await new Promise((r) => setTimeout(r, 50));
		expect(edits).toEqual([]);
		path = 'a.tex';
		click();
		await vi.waitFor(() => expect(edits).toHaveLength(1));
		info.mockRestore();
		openTexFile.current = null;
	});
});
