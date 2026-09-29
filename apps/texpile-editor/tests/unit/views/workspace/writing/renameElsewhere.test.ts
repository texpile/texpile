// @vitest-environment jsdom
// a rename in the open file following its uses into the project's other files
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toasts: { kind: string; title: string }[] = [];
vi.mock('$lib/modals/toaster-svelte', () => ({
	toaster: Object.fromEntries(
		['success', 'info', 'warning', 'error'].map((kind) => [kind, (t: { title: string }) => toasts.push({ kind, title: t.title })])
	)
}));

import { makeRenameElsewhere, type RenameElsewhereDeps } from '../../../../../src/views/workspace/writing/workspaceReplace';
import { FileHistory } from '$lib/workspace/fileHistory.svelte';
import { replaceInText } from '$lib/search/replaceInFiles';

function project(files: Record<string, string>, open = '/p/main.tex') {
	const disk = new Map(Object.entries(files));
	const history = new FileHistory();
	const search = vi.fn(async (_root: string, query: string) => {
		const re = new RegExp(query);
		return {
			results: [...disk]
				.filter(([, text]) => text.split('\n').some((l) => re.test(l)))
				.map(([file]) => ({ file, rel: file, matches: [{ line: 1, text: '' }] }))
		};
	});
	const d = {
		provider: () => ({
			readSource: async (p: string) => ({ text: disk.get(p)!, encoding: 'utf8' }),
			readText: async (p: string) => {
				if (!disk.has(p)) throw new Error('ENOENT');
				return disk.get(p)!;
			},
			writeText: async (p: string, t: string) => void disk.set(p, t)
		}),
		doc: { path: open, buffer: disk.get(open) ?? '', eol: 'lf' },
		modes: { mode: 'source' },
		kind: () => 'tex',
		parseVisual: async () => null,
		saver: () => ({ flushAndWait: async () => {} }),
		history: () => history,
		reloadOpen: async () => {},
		root: () => '/p',
		main: () => '/p/main.tex',
		search
	} as unknown as RenameElsewhereDeps;
	return { disk, history, search, rename: makeRenameElsewhere(d) };
}

beforeEach(() => {
	vi.useFakeTimers();
	toasts.length = 0;
});
afterEach(() => vi.useRealTimers());

describe('makeRenameElsewhere', () => {
	it("renames a label's references in its own document's other files once the renaming stops, and in no other paper", async () => {
		const { disk, history, rename } = project({
			'/p/main.tex': '\\begin{document}\\input{ch1}\\input{ch2}\\end{document}',
			'/p/ch1.tex': '\\label{fig:a} see \\ref{fig:a}',
			'/p/ch2.tex': 'As \\cref{fig:a,fig:b} show.',
			'/p/response.tex': '\\begin{document}\\ref{fig:a}\\end{document}',
			'/p/notes.md': 'fig:a'
		});
		rename('label', 'fig:a', 'fig:results');
		await vi.advanceTimersByTimeAsync(1000);
		expect(disk.get('/p/ch1.tex')).toBe('\\label{fig:a} see \\ref{fig:results}');
		expect(disk.get('/p/ch2.tex')).toBe('As \\cref{fig:results,fig:b} show.');
		expect(disk.get('/p/response.tex')).toBe('\\begin{document}\\ref{fig:a}\\end{document}');
		expect(disk.get('/p/notes.md')).toBe('fig:a');
		expect(toasts).toEqual([{ kind: 'success', title: 'Also updated 2 references in 2 files' }]);
		// undone with the rename itself, in the editor, not on its own
		expect(history.undoStack).toHaveLength(0);
	});

	it('carries out a keystroke-by-keystroke rename once, from the first name to the last', async () => {
		const { disk, search, rename } = project({
			'/p/main.tex': '\\begin{document}\\input{ch2}\\end{document}',
			'/p/ch2.tex': 'See \\ref{fig:a}.'
		});
		for (const [from, to] of [
			['fig:a', 'fig:'],
			['fig:', 'fig:r'],
			['fig:r', 'fig:re'],
			['fig:re', 'fig:res']
		])
			rename('label', from, to);
		await vi.advanceTimersByTimeAsync(1000);
		expect(disk.get('/p/ch2.tex')).toBe('See \\ref{fig:res}.');
		// one lookup per language, for the first name only
		expect(search).toHaveBeenCalledTimes(2);
		expect(
			replaceInText('\\ref{fig:a}', { query: search.mock.calls[0][1], replacement: 'x', regex: true, caseSensitive: true }).count
		).toBe(1);
	});

	it('follows a citation key into the LaTeX and Typst documents that use the .bib, each in its own syntax', async () => {
		const { disk, rename } = project(
			{
				'/p/refs.bib': '@book{knuth1984, title={x}}',
				'/p/main.tex': '\\begin{document}\\input{a}\\bibliography{refs}\\end{document}',
				'/p/a.tex': '\\citep{knuth84}',
				'/p/b.typ': '#bibliography("refs.bib")\nAs @knuth84 wrote',
				'/p/other.tex': '\\begin{document}\\cite{knuth84}\\bibliography{mine}\\end{document}'
			},
			'/p/refs.bib'
		);
		rename('cite', 'knuth84', 'knuth1984');
		await vi.advanceTimersByTimeAsync(1000);
		expect(disk.get('/p/a.tex')).toBe('\\citep{knuth1984}');
		expect(disk.get('/p/b.typ')).toBe('#bibliography("refs.bib")\nAs @knuth1984 wrote');
		expect(disk.get('/p/other.tex')).toBe('\\begin{document}\\cite{knuth84}\\bibliography{mine}\\end{document}');
		expect(toasts[0].title).toBe('Also updated 2 citations in 2 files');
	});

	it('says nothing when no other file uses the name', async () => {
		const { rename } = project({ '/p/main.tex': '\\begin{document}\\input{a}\\end{document}', '/p/a.tex': 'nothing here' });
		rename('label', 'fig:a', 'fig:b');
		await vi.advanceTimersByTimeAsync(1000);
		expect(toasts).toEqual([]);
	});
});
