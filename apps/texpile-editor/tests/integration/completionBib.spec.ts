import { expect, test } from '@playwright/test';
import { useTexpile } from './driver/useTexpile';
import fs from 'node:fs';
import { acceptCompletion, checkCase, expectLineStart, labels, probe, type Case } from './driver/completionHelpers';

const texpile = useTexpile({ files: { 'figures/photo.png': 'png' } });

const INTRO = '\\section{Introduction}\\label{sec:intro}\n';
const SPEED = 'Speed is';
const CHAPTER = '\\chapter{Plain}\n';
function group(name: string, cases: Case[]): void {
	for (const c of cases) test(`${name}: ${c.name}`, async () => void (await checkCase(texpile().source, c)));
}

group('bib', [
	{ name: 'volume inside @book', file: 'refs.bib', anchor: '  year      = {1984}\n', typed: 'vol', has: ['volume'] },
	{ name: 'issue inside @article', file: 'refs.bib', anchor: '  year         = {1986}\n', typed: 'iss', has: ['issue'] },
	{ name: 'nothing between entries', file: 'refs.bib', anchor: '  year         = {1986}\n}\n', typed: 'ab', none: true },
	{ name: 'entry types after @', file: 'refs.bib', anchor: '}\n', typed: '@art', has: ['@article'] }
]);

test('cite: the row shows the title and a hover card shows the entry', async () => {
	const rows = await probe(texpile().source, { file: 'main.tex', anchor: SPEED, typed: ' \\cite{knu' });
	const knuth = rows.find((r) => r.label === 'knuth1984');
	expect(knuth?.detail, JSON.stringify(rows)).toContain('TeXbook');
});

test('ref: a label from another file names its file', async () => {
	const rows = await probe(texpile().source, { file: 'main.tex', anchor: SPEED, typed: ' \\ref{fig:pl' });
	expect(rows.find((r) => r.label === 'fig:plot')?.detail, JSON.stringify(rows)).toContain('results.tex');
});

test('glossary: the row shows the description', async () => {
	const rows = await probe(texpile().source, { file: 'main.tex', anchor: SPEED, typed: ' \\gls{la' });
	expect(rows.find((r) => r.label === 'latex')?.detail, JSON.stringify(rows)).toContain('typesetting');
});

test('acro: the row shows the long form', async () => {
	const rows = await probe(texpile().source, { file: 'main.tex', anchor: SPEED, typed: ' \\ac{cp' });
	expect(rows.find((r) => r.label === 'cpu')?.detail, JSON.stringify(rows)).toContain('central processing unit');
});

test('cite: a key added to refs.bib on disk is offered', async () => {
	const { source } = texpile();
	const file = source.path('refs.bib');
	const original = fs.readFileSync(file, 'utf8');
	try {
		fs.writeFileSync(file, `${original}\n@misc{zzfresh2026,\n  title = {Fresh},\n  year = {2026}\n}\n`);
		await expect
			.poll(async () => labels(await probe(source, { file: 'main.tex', anchor: SPEED, typed: ' \\cite{zzfr' })), { timeout: 20_000 })
			.toContain('zzfresh2026');
	} finally {
		fs.writeFileSync(file, original);
	}
});

test('acceptance: a cite key inserts only the key', async () => {
	const r = await acceptCompletion(texpile().source, { file: 'main.tex', anchor: SPEED, typed: ' \\cite{TeXb' }, { pick: 'knuth1984' });
	expectLineStart(r, 'Speed is \\cite{knuth1984|}');
});

test('acceptance: a second key goes after the comma', async () => {
	const r = await acceptCompletion(
		texpile().source,
		{ file: 'main.tex', anchor: SPEED, typed: ' \\cite{knuth1984,lam' },
		{ pick: 'lamport1986' }
	);
	expectLineStart(r, 'Speed is \\cite{knuth1984,lamport1986|}');
});

test('acceptance: a label inserts the label', async () => {
	const r = await acceptCompletion(texpile().source, { file: 'main.tex', anchor: SPEED, typed: ' \\ref{fig:pl' }, { pick: 'fig:plot' });
	expectLineStart(r, 'Speed is \\ref{fig:plot|}');
});

test('acceptance: a path inserts the file name', async () => {
	const r = await acceptCompletion(
		texpile().source,
		{ file: 'main.tex', anchor: '\\addbibresource{', replace: 'refs.bib', typed: 'r' },
		{ pick: 'refs.bib' }
	);
	expect(r.line).toContain('\\addbibresource{refs.bib');
});

test('acceptance: a color replaces the typed part', async () => {
	const r = await acceptCompletion(
		texpile().source,
		{ file: 'main.tex', anchor: SPEED, typed: ' \\textcolor{brandb' },
		{ pick: 'brandblue' }
	);
	expectLineStart(r, 'Speed is \\textcolor{brandblue|}');
});

test('acceptance: an environment from the folder package builds the block', async () => {
	const r = await acceptCompletion(texpile().source, { file: 'main.tex', anchor: INTRO, typed: '\\begin{qab' }, { pick: 'qabox' });
	expect(r.text).toMatch(/\\begin\{qabox\}\n\s*\n\\end\{qabox\}/);
});

test('acceptance: an environment from a package file builds the block', async () => {
	const r = await acceptCompletion(
		texpile().source,
		{ file: 'plain.tex', anchor: CHAPTER, typed: '\\begin{inhouseb' },
		{ pick: 'inhousebox' }
	);
	expect(r.text).toMatch(/\\begin\{inhousebox\}\n\s*\n\\end\{inhousebox\}/);
});

const BETWEEN = '  year      = {1984}\n}\n';

group('bib files', [
	{ name: 'doi in a new line of an entry', file: 'refs.bib', anchor: '  year      = {1984}\n', typed: 'doi', has: ['doi'] },
	{
		name: 'a required field is not offered again',
		file: 'refs.bib',
		anchor: '  year      = {1984}\n',
		typed: 'auth',
		lacks: ['author']
	},
	{ name: 'a bare @ lists the entry types', file: 'refs.bib', anchor: BETWEEN, typed: '@', hasPrefix: ['@article', '@book', '@misc'] },
	{ name: '@book is among the entry types', file: 'refs.bib', anchor: BETWEEN, typed: '@boo', has: ['@book'] },
	{ name: 'a field name after the entry is closed offers nothing', file: 'refs.bib', anchor: BETWEEN, typed: 'vol', none: true },
	{
		name: 'Backspace in a field name reopens the list',
		file: 'refs.bib',
		anchor: '  year      = {1984}\n',
		typed: 'volx',
		backspaces: 1,
		has: ['volume']
	},
	{
		name: 'a repeated value is offered inside the braces',
		file: 'refs.bib',
		anchor: '  year      = {1984}\n',
		typed: 'publisher = {Add',
		has: ['Addison-Wesley']
	},
	{
		name: 'a value of another entry for the same field',
		file: 'refs.bib',
		anchor: '  year      = {1984}\n',
		typed: 'year = {19',
		has: ['1986']
	},
	{ name: 'a value of a title', file: 'refs.bib', anchor: '  year      = {1984}\n', typed: 'title = {The Te', has: ['The TeXbook'] },
	{
		name: 'a field with no earlier value offers nothing',
		file: 'refs.bib',
		anchor: '  year      = {1984}\n',
		typed: 'doi = {1',
		none: true
	},
	{ name: 'a new entry types after a blank line', file: 'refs.bib', anchor: BETWEEN, insert: '\n', typed: '@arti', has: ['@article'] }
]);

test('bib files: accepting @article builds the entry with its required fields', async () => {
	const r = await acceptCompletion(texpile().source, { file: 'refs.bib', anchor: BETWEEN, typed: '@arti' }, { pick: '@article' });
	expect(r.text).toMatch(/@article\{key,\n\s+author = \{\},\n\s+title = \{\},[^]*year = \{\}\n\}/);
});

test('bib files: accepting a field name writes the braces', async () => {
	const r = await acceptCompletion(
		texpile().source,
		{ file: 'refs.bib', anchor: '  year      = {1984}\n', typed: 'volu' },
		{ pick: 'volume' }
	);
	expectLineStart(r, 'volume = {|}');
});
