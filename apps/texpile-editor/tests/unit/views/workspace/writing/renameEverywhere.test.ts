// @vitest-environment jsdom
// a rename started in the source editor reaching the definition and the uses across the document
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import * as Y from 'yjs';
import { yCollab } from 'y-codemirror.next';
import { FileHistory } from '$lib/workspace/fileHistory.svelte';
import { createFileUndo } from '$lib/buffers/fileUndo';

const toasts: { kind: string; title: string }[] = [];
vi.mock('$lib/modals/toaster-svelte', () => ({
	toaster: Object.fromEntries(
		['success', 'info', 'warning', 'error'].map((kind) => [kind, (t: { title: string }) => toasts.push({ kind, title: t.title })])
	)
}));

import { makeRenameEverywhere, type SymbolRenameDeps } from '../../../../../src/views/workspace/writing/workspaceRename';
import { sourceCmView } from '$lib/stores/editorStore';
import { detectedMainFile, documentMainFile, mainFile } from '$lib/workspace/workspaceStore';

const PREAMBLE = '\\documentclass{article}\\usepackage{listings,glossaries}\\begin{document}';

const views: EditorView[] = [];
let fileHistory: FileHistory | null = null;

function project(
	files: Record<string, string>,
	open = '/p/main.tex',
	host = true,
	main: () => string | null = () => '/p/main.tex',
	shared = false,
	// a disk as slow as a real one, so a key can come while a step still writes
	slowWrites = false
) {
	const disk = new Map(Object.entries(files));
	const doc = { path: open, buffer: disk.get(open) ?? '', eol: 'lf' };
	// shared: the file's own history, as the app binds its editors to it
	const ytext = new Y.Doc().getText('t');
	ytext.insert(0, doc.buffer);
	const um = shared ? createFileUndo(ytext, open) : null;
	const extensions = um ? [yCollab(ytext, null, { undoManager: um })] : [history()];
	const view = new EditorView({ state: EditorState.create({ doc: doc.buffer, extensions }), parent: document.body });
	views.push(view);
	sourceCmView.current = view;
	const d = {
		provider: () => ({
			readSource: async (p: string) => ({ text: disk.get(p)!, encoding: 'utf8' }),
			readText: async (p: string) => {
				if (!disk.has(p)) throw new Error('ENOENT');
				return disk.get(p)!;
			},
			writeText: async (p: string, t: string) => {
				if (slowWrites) await new Promise((r) => setTimeout(r, 30));
				disk.set(p, t);
			}
		}),
		doc,
		modes: { mode: 'source' },
		kind: () => 'tex',
		parseVisual: async () => null,
		saver: () => ({ flushAndWait: async () => void (doc.buffer = view.state.doc.toString()) }),
		history: () => fileHistory,
		reloadOpen: async () => {},
		root: () => '/p',
		main,
		search: async (_root: string, query: string) => ({
			results: [...disk].filter(([, text]) => new RegExp(query, 'i').test(text)).map(([file]) => ({ file, rel: file, matches: [] }))
		}),
		elsewhere: () => host,
		undoOf: () => um
	} as unknown as SymbolRenameDeps;
	return { disk, view, um, rename: makeRenameEverywhere(d) };
}

beforeEach(() => {
	toasts.length = 0;
});

afterEach(() => {
	sourceCmView.current = null;
	detectedMainFile.current = null;
	fileHistory = null;
	for (const view of views.splice(0)) view.destroy();
});

describe('makeRenameEverywhere', () => {
	it('undoes and redoes the rename in the other files with the editor, as VS Code does', async () => {
		fileHistory = new FileHistory();
		const { disk, view, um, rename } = project(
			{
				'/p/main.tex': `${PREAMBLE}\\label{sec:a}\\input{ch1}\\end{document}`,
				'/p/ch1.tex': 'See \\ref{sec:a}.'
			},
			'/p/main.tex',
			true,
			() => '/p/main.tex',
			true
		);
		await rename('label', 'sec:a', 'sec:b');
		expect(disk.get('/p/ch1.tex')).toBe('See \\ref{sec:b}.');
		// Ctrl+Z in either editor steps the file's history
		um!.undo();
		await vi.waitFor(() => expect(disk.get('/p/ch1.tex')).toBe('See \\ref{sec:a}.'));
		expect(view.state.doc.toString()).toContain('\\label{sec:a}');
		um!.redo();
		await vi.waitFor(() => expect(disk.get('/p/ch1.tex')).toBe('See \\ref{sec:b}.'));
		expect(view.state.doc.toString()).toContain('\\label{sec:b}');
	});

	it('redoes in every file when redo comes while the undo still writes', async () => {
		fileHistory = new FileHistory();
		const { disk, view, um, rename } = project(
			{
				'/p/main.tex': `${PREAMBLE}\\label{sec:a}\\input{ch1}\\end{document}`,
				'/p/ch1.tex': 'See \\ref{sec:a}.'
			},
			'/p/main.tex',
			true,
			() => '/p/main.tex',
			true,
			true
		);
		await rename('label', 'sec:a', 'sec:b');
		um!.undo();
		um!.redo();
		// both steps write in turn; read once they have
		await new Promise((r) => setTimeout(r, 400));
		expect(view.state.doc.toString()).toContain('\\label{sec:b}');
		expect(disk.get('/p/ch1.tex')).toBe('See \\ref{sec:b}.');
	});

	it('leaves every file renamed when another file changed since, as its message says', async () => {
		fileHistory = new FileHistory();
		const { disk, view, um, rename } = project(
			{
				'/p/main.tex': `${PREAMBLE}\\label{sec:a}\\input{ch1}\\end{document}`,
				'/p/ch1.tex': 'See \\ref{sec:a}.'
			},
			'/p/main.tex',
			true,
			() => '/p/main.tex',
			true
		);
		await rename('label', 'sec:a', 'sec:b');
		disk.set('/p/ch1.tex', 'See \\ref{sec:b}. More.');
		um!.undo();
		await vi.waitFor(() => expect(toasts.some((t) => t.kind === 'error')).toBe(true));
		await vi.waitFor(() => expect(view.state.doc.toString()).toContain('\\label{sec:b}'));
		expect(disk.get('/p/ch1.tex')).toBe('See \\ref{sec:b}. More.');
	});

	it('reaches the whole document from a fragment before a main file is chosen', async () => {
		mainFile.current = null;
		detectedMainFile.current = '/p/main.tex';
		const { disk, view, rename } = project(
			{
				'/p/main.tex': `${PREAMBLE}\\input{ch1}\\input{ch2}\\end{document}`,
				'/p/ch1.tex': '\\section{A}\\label{sec:a}',
				'/p/ch2.tex': 'See \\ref{sec:a}.'
			},
			'/p/ch2.tex',
			true,
			documentMainFile
		);
		await rename('label', 'sec:a', 'sec:b');
		expect(view.state.doc.toString()).toBe('See \\ref{sec:b}.');
		expect(disk.get('/p/ch1.tex')).toBe('\\section{A}\\label{sec:b}');
	});

	it('renames a label at its \\label, \\ref, \\cref and listing key across the files, the open one as a single undo step', async () => {
		const { disk, view, rename } = project({
			'/p/main.tex': `${PREAMBLE}\\label{lst:a} \\ref{lst:a}\n\\input{ch1}\\end{document}`,
			'/p/ch1.tex': '\\begin{lstlisting}[language=C,label=lst:a]\n\\end{lstlisting} \\cref{lst:b,lst:a} \\ref{lst:ab}',
			'/p/other.tex': '\\begin{document}\\ref{lst:a}\\end{document}'
		});
		await rename('label', 'lst:a', 'lst:main');
		expect(view.state.doc.toString()).toBe(`${PREAMBLE}\\label{lst:main} \\ref{lst:main}\n\\input{ch1}\\end{document}`);
		expect(disk.get('/p/ch1.tex')).toBe(
			'\\begin{lstlisting}[language=C,label=lst:main]\n\\end{lstlisting} \\cref{lst:b,lst:main} \\ref{lst:ab}'
		);
		expect(disk.get('/p/other.tex')).toBe('\\begin{document}\\ref{lst:a}\\end{document}');
		expect(toasts).toEqual([{ kind: 'success', title: 'Renamed 4 uses in 2 files' }]);
		undo(view);
		expect(view.state.doc.toString()).toBe(`${PREAMBLE}\\label{lst:a} \\ref{lst:a}\n\\input{ch1}\\end{document}`);
	});

	it('renames a citation key at its uses and at the entry line of the .bib the document names', async () => {
		const { disk, rename } = project({
			'/p/main.tex': `${PREAMBLE}\\cite{knuth84} \\input{ch1}\\bibliography{refs}\\end{document}`,
			'/p/ch1.tex': '\\citep[p.~3]{lamport,knuth84}',
			'/p/refs.bib': '@book{knuth84,\n  title = {knuth84}\n}\n@book{lamport,\n}',
			'/p/mine.bib': '@book{knuth84,\n}'
		});
		await rename('cite', 'knuth84', 'knuth1984');
		expect(disk.get('/p/ch1.tex')).toBe('\\citep[p.~3]{lamport,knuth1984}');
		expect(disk.get('/p/refs.bib')).toBe('@book{knuth1984,\n  title = {knuth84}\n}\n@book{lamport,\n}');
		expect(disk.get('/p/mine.bib')).toBe('@book{knuth84,\n}');
		expect(toasts[0].title).toBe('Renamed 3 uses in 3 files');
	});

	it('renames a glossary entry at \\newglossaryentry and at every \\gls form', async () => {
		const { disk, view, rename } = project({
			'/p/main.tex': `${PREAMBLE}\\newglossaryentry{cpu}{name={CPU},description={processor}}\n\\gls{cpu} \\input{ch1}\\end{document}`,
			'/p/ch1.tex': '\\glspl{cpu} and \\Gls{cpus}'
		});
		await rename('glossary', 'cpu', 'proc');
		expect(view.state.doc.toString()).toContain('\\newglossaryentry{proc}{name={CPU},description={processor}}\n\\gls{proc}');
		expect(disk.get('/p/ch1.tex')).toBe('\\glspl{proc} and \\Gls{cpus}');
	});

	it('refuses a name the document already defines and changes nothing', async () => {
		const { disk, view, rename } = project({
			'/p/main.tex': `${PREAMBLE}\\label{a} \\input{ch1}\\end{document}`,
			'/p/ch1.tex': '\\label{b} \\ref{a}'
		});
		const before = view.state.doc.toString();
		await rename('label', 'a', 'b');
		expect(toasts).toEqual([{ kind: 'error', title: 'The name b is already defined' }]);
		expect(view.state.doc.toString()).toBe(before);
		expect(disk.get('/p/ch1.tex')).toBe('\\label{b} \\ref{a}');
	});

	it('refuses a citation key the .bib files already hold', async () => {
		const { disk, rename } = project({
			'/p/main.tex': `${PREAMBLE}\\cite{a}\\bibliography{refs}\\end{document}`,
			'/p/refs.bib': '@book{a,\n}\n@book{b,\n}'
		});
		await rename('cite', 'a', 'b');
		expect(toasts[0]).toEqual({ kind: 'error', title: 'The name b is already defined' });
		expect(disk.get('/p/refs.bib')).toBe('@book{a,\n}\n@book{b,\n}');
	});

	it('renames a use whose argument runs over lines', async () => {
		const { disk, rename } = project({
			'/p/main.tex': `${PREAMBLE}\\label{fig:a}\\input{ch1}\\end{document}`,
			'/p/ch1.tex': '\\cref{fig:b,\n fig:a} \\ref{\n  fig:a\n}'
		});
		await rename('label', 'fig:a', 'fig:z');
		expect(disk.get('/p/ch1.tex')).toBe('\\cref{fig:b,\n fig:z} \\ref{\n  fig:z\n}');
		expect(toasts).toEqual([{ kind: 'success', title: 'Renamed 3 uses in 2 files' }]);
	});

	it('renames a citation key in every document that names the same .bib', async () => {
		const { disk, rename } = project({
			'/p/main.tex': `${PREAMBLE}\\cite{knuth84}\\bibliography{refs}\\end{document}`,
			'/p/response.tex': '\\begin{document}\\cite{knuth84,other}\\bibliography{refs}\\end{document}',
			'/p/elsewhere.tex': '\\begin{document}\\cite{knuth84}\\bibliography{mine}\\end{document}',
			'/p/refs.bib': '@book{knuth84,\n}\n@book{inbook,\n crossref={knuth84}\n}',
			'/p/mine.bib': '@book{knuth84,\n}'
		});
		await rename('cite', 'knuth84', 'knuth1984');
		expect(disk.get('/p/response.tex')).toBe('\\begin{document}\\cite{knuth1984,other}\\bibliography{refs}\\end{document}');
		expect(disk.get('/p/refs.bib')).toBe('@book{knuth1984,\n}\n@book{inbook,\n crossref={knuth1984}\n}');
		expect(disk.get('/p/elsewhere.tex')).toBe('\\begin{document}\\cite{knuth84}\\bibliography{mine}\\end{document}');
		expect(disk.get('/p/mine.bib')).toBe('@book{knuth84,\n}');
	});

	it('refuses a name the .tex and the wrappers of the document already define', async () => {
		const { view, rename } = project({
			'/p/main.tex': `${PREAMBLE}\\newcommand{\\mylabel}[1]{\\label{#1}}\\mylabel{b}\\ref{a}\\begin{lstlisting}[label=c]\n\\end{lstlisting}\\label{a}\\end{document}`
		});
		const before = view.state.doc.toString();
		await rename('label', 'a', 'b');
		await rename('label', 'a', 'c');
		expect(toasts.map((t) => t.title)).toEqual(['The name b is already defined', 'The name c is already defined']);
		expect(view.state.doc.toString()).toBe(before);
	});

	it('renames an entry that another entry names as parent', async () => {
		const { view, rename } = project({
			'/p/main.tex': `${PREAMBLE}\\newglossaryentry{cpu}{name={CPU},description={x}}\\newglossaryentry{gpu}{name={GPU},description={y},\n parent=cpu}\\end{document}`
		});
		await rename('glossary', 'cpu', 'proc');
		expect(view.state.doc.toString()).toContain('\\newglossaryentry{proc}{name={CPU}');
		expect(view.state.doc.toString()).toContain('parent=proc}');
	});

	it('rejects a new name the kind cannot hold, saying which characters', async () => {
		const { view, rename } = project({ '/p/main.tex': `${PREAMBLE}\\cite{a}\\label{x}\\end{document}` });
		const before = view.state.doc.toString();
		await rename('cite', 'a', "k'1");
		await rename('label', 'x', 'k=1,2');
		expect(toasts).toEqual([
			{ kind: 'error', title: 'Remove spaces and these characters from the name: " # % \' ( ) , = { } \\' },
			{ kind: 'error', title: 'Remove spaces and these characters from the name: \\ # % { } ,' }
		]);
		expect(view.state.doc.toString()).toBe(before);
	});

	describe('as a guest', () => {
		it('renames a name the open file alone uses', async () => {
			const { view, rename } = project(
				{ '/p/main.tex': `${PREAMBLE}\\label{a}\\ref{a}\\input{ch1}\\end{document}`, '/p/ch1.tex': 'text' },
				'/p/main.tex',
				false
			);
			await rename('label', 'a', 'b');
			expect(view.state.doc.toString()).toContain('\\label{b}\\ref{b}');
			expect(toasts).toEqual([{ kind: 'success', title: 'Renamed 2 uses in 1 file' }]);
		});

		it('refuses when another file uses the name, changing nothing', async () => {
			const { disk, view, rename } = project(
				{ '/p/main.tex': `${PREAMBLE}\\label{a}\\input{ch1}\\end{document}`, '/p/ch1.tex': 'see \\ref{a}' },
				'/p/main.tex',
				false
			);
			const before = view.state.doc.toString();
			await rename('label', 'a', 'b');
			expect(toasts).toEqual([{ kind: 'error', title: 'a is also used in other files. Only the host can rename it.' }]);
			expect(view.state.doc.toString()).toBe(before);
			expect(disk.get('/p/ch1.tex')).toBe('see \\ref{a}');
		});
	});
});
