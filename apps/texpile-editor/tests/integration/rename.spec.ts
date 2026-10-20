import { expect, test, type Locator } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { Disk } from './driver/disk';
import { FIXTURE } from './driver/launch';
import { useTexpile } from './driver/useTexpile';

const fixture = (rel: string) => fs.readFileSync(path.join(FIXTURE, rel), 'utf8');

function patch(text: string, from: string, to: string): string {
	if (!text.includes(from)) throw new Error(`fixture has no ${JSON.stringify(from)}`);
	return text.replace(from, to);
}

// the fixture with uses of its labels, citation keys and glossary entry in both files
const MAIN = patch(
	patch(
		fixture('main.tex'),
		'Speed is $v^{2}$ and $x_{max}$.\n',
		'Speed is $v^{2}$ and $x_{max}$. See Section~\\ref{sec:intro}, \\cref{eq:energy,sec:results} and \\cite{knuth1984}.\n'
	),
	'\\input{chapters/results}',
	'Equation~\\eqref{eq:energy} holds for \\vect{x} in the \\gls{latex} entry.\n\n\\input{chapters/results}'
);
const RESULTS = patch(
	patch(
		fixture('chapters/results.tex'),
		'The vector $\\vect{v}$ was measured.',
		'The vector $\\vect{v}$ was measured as in Section~\\ref{sec:intro} and \\cref{sec:intro,eq:energy}~\\cite{knuth1984,lamport1986}. See \\gls{latex}.'
	),
	'Body text.',
	'Body text. By Theorem~\\ref{thm:main} and Figure~\\ref{fig:plot}.'
);
const BIB = fixture('refs.bib');
const latexDoc = (body: string, extra = '') => `\\documentclass{article}\n${extra}\\begin{document}\n\n${body}\n\n\\end{document}\n`;

const REFS_MAIN = latexDoc(
	[
		'\\section{A}\\label{sec:intro}\\label{sec:intro2}',
		'See \\ref{sec:intro}, \\autoref{sec:intro}, \\Cref{sec:intro}, \\nameref{sec:intro}, \\pageref{sec:intro},',
		'\\hyperref[sec:intro]{here}, \\vref{sec:intro}, \\ref{sec:intro2} and \\ref{sec:intro-extra}.',
		'% commented \\ref{sec:intro}',
		'\\begin{verbatim}',
		'\\ref{sec:intro}',
		'\\end{verbatim}',
		'\\input{edge-refs-part}'
	].join('\n'),
	'\\usepackage{hyperref}\n\\usepackage{cleveref}\n\\usepackage{varioref}\n'
);
const REFS_PART = '\\subsection{B}\\label{sec:intro-extra}\nBack to \\ref{sec:intro} and \\cref{sec:intro,sec:intro2}.\n';

const CITES_MAIN = latexDoc(
	[
		'Cites \\cite[p.~3]{smith}, \\parencite{smith}, \\textcite{smith,smith2},',
		'\\cites{smith}{smith2}, \\autocite*{smith} and \\nocite{smith}.',
		'\\printbibliography'
	].join('\n'),
	'\\usepackage[backend=biber]{biblatex}\n\\addbibresource{edge-cites.bib}\n'
);
const CITES_BIB = [
	'@book{smith,',
	'  author = {Sam Smith},',
	'  title = {About smith},',
	'  year = {2001}',
	'}',
	'',
	'@book{smith2,',
	'  author = {Sam Smith},',
	'  title = {More},',
	'  year = {2002}',
	'}',
	'',
	'@incollection{doe,',
	'  author = {Dee Doe},',
	'  title = {A chapter},',
	'  crossref = {smith},',
	'  year = {2003}',
	'}',
	''
].join('\n');

const GLOSS_MAIN = latexDoc(
	[
		'\\newglossaryentry{latex}{name={LaTeX},description={a typesetting system}}',
		'\\newglossaryentry{latexcode}{name={code},description={the latex word stays}}',
		'The \\gls{latex} and \\Gls{latex} and \\glspl{latex} and \\glsdesc{latex} and \\gls{latexcode}.',
		'\\printglossaries'
	].join('\n'),
	'\\usepackage{glossaries}\n\\makeglossaries\n'
);

const CRLF_MAIN = latexDoc('\\section{C}\\label{sec:crlf}\n\nSee \\ref{sec:crlf}.\n\n\\input{edge-crlf-part}').replace(/\n/g, '\r\n');
const CRLF_PART = 'Part text \\ref{sec:crlf} here.\nSecond line.\n'.replace(/\n/g, '\r\n');

const EXT_MAIN = latexDoc('\\section{E}\\label{sec:ext}\n\nSee \\ref{sec:ext}.\n\n\\input{edge-ext-part}');
const EXT_PART = 'Part \\ref{sec:ext} text.\n';

const UNI_MAIN = latexDoc('\\section{U}\\label{sec:müller}\n\nSee \\ref{sec:müller} and \\ref{sec:müller2}.\n\\label{sec:müller2}');

const ORIGINAL: Record<string, string> = {
	'main.tex': MAIN,
	'chapters/results.tex': RESULTS,
	'refs.bib': BIB,
	'edge-refs.tex': REFS_MAIN,
	'edge-refs-part.tex': REFS_PART,
	'edge-cites.tex': CITES_MAIN,
	'edge-cites.bib': CITES_BIB,
	'edge-gloss.tex': GLOSS_MAIN,
	'edge-crlf.tex': CRLF_MAIN,
	'edge-crlf-part.tex': CRLF_PART,
	'edge-ext.tex': EXT_MAIN,
	'edge-ext-part.tex': EXT_PART,
	'edge-uni.tex': UNI_MAIN
};

const texpile = useTexpile({
	files: {
		'main.tex': MAIN,
		'chapters/results.tex': RESULTS,
		'edge-refs.tex': REFS_MAIN,
		'edge-refs-part.tex': REFS_PART,
		'edge-cites.tex': CITES_MAIN,
		'edge-cites.bib': CITES_BIB,
		'edge-gloss.tex': GLOSS_MAIN,
		'edge-crlf.tex': CRLF_MAIN,
		'edge-crlf-part.tex': CRLF_PART,
		'edge-ext.tex': EXT_MAIN,
		'edge-ext-part.tex': EXT_PART,
		'edge-uni.tex': UNI_MAIN
	}
});

const disk = () => new Disk(texpile().root);
const count = (text: string, needle: string) => text.split(needle).length - 1;

// a label rename touches both tex files: the open one through its buffer, the other directly
async function diskIs(expected: Record<string, string>, message: string): Promise<void> {
	for (const [rel, text] of Object.entries(expected)) {
		try {
			await disk().expectFile(rel, (t) => t === text, `${message}: ${rel}`);
		} catch (e) {
			const shown = await texpile().page.locator('[data-scope="toast"][data-part="root"]').allInnerTexts();
			throw new Error(`${(e as Error).message}\ntoasts: ${JSON.stringify(shown)}`, { cause: e });
		}
	}
}

const card = () => texpile().page.locator('.cm-rename-card');
const cardInput = () => texpile().page.locator('.cm-rename-card input');
const toasts = () => texpile().page.locator('[data-scope="toast"][data-part="root"]');
const toast = (text: string | RegExp): Locator => toasts().filter({ hasText: text }).first();

/** F2 on the nth `anchor`, the new name typed over the selected old one, Enter */
async function rename(anchor: string, to: string, { nth = 0, submit = true } = {}): Promise<void> {
	const { source, page } = texpile();
	await source.caretAfter(anchor, { nth });
	await page.keyboard.press('F2');
	await expect(cardInput()).toBeFocused();
	await page.keyboard.type(to, { delay: 20 });
	await expect(cardInput()).toHaveValue(to);
	if (submit) await page.keyboard.press('Enter');
}

/** a rename the undo tests act on: the toast shows once the other files are written and the undo is tied to it */
async function renameSettled(anchor: string, to: string): Promise<void> {
	const { page } = texpile();
	await page.evaluate(async () => (await import(/* @vite-ignore */ '/src/lib/modals/toaster-svelte.ts' as string)).toaster.dismiss());
	await rename(anchor, to);
	await expect(toast(/Renamed/)).toBeVisible();
	await page.waitForTimeout(300);
}

async function openSource(rel: string): Promise<void> {
	await texpile().source.open(rel);
}

test.afterEach(async () => {
	const { source, page } = texpile();
	await page.keyboard.press('Escape');
	const active = await page.evaluate(
		async () => (await import(/* @vite-ignore */ '/src/lib/workspace/workspaceStore.ts' as string)).activeFilePath.current
	);
	// the files go back through the app's own editors where it holds them, so its undo history and the disk stay in step
	for (const [rel, text] of Object.entries(ORIGINAL)) {
		const isOpen = !!active && active.replaceAll('\\', '/').endsWith(`/${rel}`);
		if (!isOpen && disk().readBytes(rel).toString('latin1') === Buffer.from(text).toString('latin1')) continue;
		if (/\.bib$/.test(rel)) {
			disk().write(rel, text);
			continue;
		}
		await source.open(rel);
		await source.restore(text);
		await disk().expectFile(rel, (t) => t === text, `restoring ${rel}`);
	}
	// every test starts in the source editor
	await source.open('main.tex');
	texpile().takeErrors();
});

test.describe('renaming a label', () => {
	test('F2 on a \\label opens a card named Rename Label holding the name, selected', async () => {
		const { source, page } = texpile();
		await openSource('main.tex');
		await source.caretAfter('\\label{sec:');
		await page.keyboard.press('F2');
		await expect(card()).toBeVisible();
		await expect(card().getByRole('dialog', { name: 'Rename Label' })).toBeVisible();
		await expect(cardInput()).toHaveValue('sec:intro');
		const selected = await cardInput().evaluate((el: HTMLInputElement) => el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0));
		expect(selected).toBe('sec:intro');
		await page.keyboard.press('Escape');
	});

	test('renaming from the \\label changes the definition and every \\ref and \\cref in both files on disk', async () => {
		await openSource('main.tex');
		await rename('\\label{sec:', 'sec:overview');
		await diskIs(
			{
				'main.tex': MAIN.replace('\\label{sec:intro}', '\\label{sec:overview}').replace('\\ref{sec:intro}', '\\ref{sec:overview}'),
				'chapters/results.tex': RESULTS.replaceAll('{sec:intro', '{sec:overview').replace('\\cref{sec:intro,', '\\cref{sec:overview,')
			},
			'after renaming sec:intro'
		);
		expect(count(disk().read('main.tex'), 'sec:intro')).toBe(0);
		expect(count(disk().read('chapters/results.tex'), 'sec:intro')).toBe(0);
		expect(count(disk().read('main.tex') + disk().read('chapters/results.tex'), 'sec:overview')).toBe(4);
		await expect(toast(/Renamed 4 uses in 2 files/)).toBeVisible();
	});

	test('the open editor shows the renamed text too', async () => {
		const { source } = texpile();
		await openSource('main.tex');
		await rename('\\label{sec:', 'sec:overview');
		await expect.poll(async () => (await source.text()).includes('\\ref{sec:overview}')).toBe(true);
		expect(await source.text()).not.toContain('sec:intro');
	});

	test('renaming from a \\ref gives the same result', async () => {
		await openSource('main.tex');
		await rename('Section~\\ref{sec:', 'sec:start');
		await disk().expectFile(
			'chapters/results.tex',
			(t) => !t.includes('sec:intro') && count(t, 'sec:start') === 2,
			'results.tex after renaming from a \\ref'
		);
		await disk().expectFile(
			'main.tex',
			(t) => !t.includes('sec:intro') && count(t, 'sec:start') === 2,
			'main.tex after renaming from a \\ref'
		);
	});

	test('a key inside a \\cref list renames that key only', async () => {
		await openSource('main.tex');
		await rename('\\cref{eq:', 'eq:mass');
		const main = await disk().expectFile('main.tex', (t) => t.includes('\\cref{eq:mass,sec:results}'), 'the \\cref list in main.tex');
		expect(main).toContain('\\label{eq:mass}');
		expect(main).toContain('\\eqref{eq:mass}');
		expect(main).toContain('\\label{sec:intro}');
		const results = await disk().expectFile(
			'chapters/results.tex',
			(t) => t.includes('\\cref{sec:intro,eq:mass}'),
			'the \\cref list in results.tex'
		);
		expect(results).not.toContain('eq:energy');
	});

	test('a longer label with the same start is not touched', async () => {
		await openSource('main.tex');
		await rename('\\label{eq:', 'eq:e');
		const main = await disk().expectFile('main.tex', (t) => t.includes('\\label{eq:e}'), 'main.tex');
		expect(main).toContain('\\ref{sec:intro}');
		expect(main).toContain('sec:results');
	});

	test('F2 in chapters/results.tex renames the label in main.tex too', async () => {
		await openSource('chapters/results.tex');
		await rename('Section~\\ref{sec:', 'sec:begin');
		await disk().expectFile(
			'main.tex',
			(t) => !t.includes('sec:intro') && count(t, 'sec:begin') === 2,
			'main.tex after renaming from the fragment'
		);
		await disk().expectFile(
			'chapters/results.tex',
			(t) => !t.includes('sec:intro') && count(t, 'sec:begin') === 2,
			'results.tex after renaming from the fragment'
		);
	});

	test('a label defined in the fragment is renamed in the main file that uses it', async () => {
		await openSource('main.tex');
		await rename('\\label{sec:', 'sec:first');
		await openSource('chapters/results.tex');
		await rename('\\label{thm:', 'thm:key');
		await disk().expectFile('chapters/results.tex', (t) => t.includes('\\label{thm:key}') && t.includes('\\ref{thm:key}'), 'results.tex');
		expect(disk().read('chapters/results.tex')).not.toContain('thm:main');
	});

	test('the same name is a no-op with no toast', async () => {
		await openSource('main.tex');
		await rename('\\label{sec:', 'sec:intro');
		await texpile().page.waitForTimeout(800);
		await expect(card()).toHaveCount(0);
		await expect(toasts().filter({ hasText: /Renamed/ })).toHaveCount(0);
		await disk().expectUnchanged('chapters/results.tex', RESULTS, 500);
	});

	test('a name another label has is refused with a toast and nothing changes', async () => {
		await openSource('main.tex');
		await rename('\\label{sec:', 'eq:energy');
		await expect(toast('The name eq:energy is already defined')).toBeVisible();
		await disk().expectUnchanged('main.tex', MAIN, 800);
		await disk().expectUnchanged('chapters/results.tex', RESULTS, 100);
	});

	test('a name taken in the other file is refused too', async () => {
		await openSource('main.tex');
		await rename('\\label{sec:', 'fig:plot');
		await expect(toast('The name fig:plot is already defined')).toBeVisible();
		await disk().expectUnchanged('chapters/results.tex', RESULTS, 800);
	});
});

test.describe('cancelling and invalid names', () => {
	test('Escape closes the card and changes nothing', async () => {
		const { source, page } = texpile();
		await openSource('main.tex');
		await rename('\\label{sec:', 'sec:other', { submit: false });
		await page.keyboard.press('Escape');
		await expect(card()).toHaveCount(0);
		await disk().expectUnchanged('main.tex', MAIN, 800);
		await disk().expectUnchanged('chapters/results.tex', RESULTS, 100);
		expect(await source.text()).toBe(MAIN);
	});

	test('after Escape the keyboard types into the editor again', async () => {
		const { source, page } = texpile();
		await openSource('main.tex');
		await source.caretAfter('\\label{sec:');
		await page.keyboard.press('F2');
		await expect(cardInput()).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(card()).toHaveCount(0);
		await page.keyboard.type('Q', { delay: 20 });
		expect(await source.text()).toContain('\\label{sec:Qintro}');
	});

	test('a name with a space shows the invalid-name message, keeps the card open and changes nothing', async () => {
		const { page } = texpile();
		await openSource('main.tex');
		await rename('\\label{sec:', 'two words');
		await expect(card().getByRole('alert')).toContainText('Remove spaces and these characters from the name');
		await expect(card()).toBeVisible();
		await disk().expectUnchanged('main.tex', MAIN, 800);
		await disk().expectUnchanged('chapters/results.tex', RESULTS, 100);
		await page.keyboard.press('Escape');
	});

	test('a name with a brace is invalid', async () => {
		const { page } = texpile();
		await openSource('main.tex');
		await rename('\\label{sec:', 'a}b');
		await expect(card().getByRole('alert')).toContainText('Remove spaces and these characters');
		await page.keyboard.press('Escape');
		await disk().expectUnchanged('main.tex', MAIN, 500);
	});

	test('an empty name asks for a name', async () => {
		const { source, page } = texpile();
		await openSource('main.tex');
		await source.caretAfter('\\label{sec:');
		await page.keyboard.press('F2');
		await expect(cardInput()).toBeFocused();
		await page.keyboard.press('Backspace');
		await page.keyboard.press('Enter');
		await expect(card().getByRole('alert')).toHaveText('Enter a name');
		await page.keyboard.press('Escape');
		await disk().expectUnchanged('main.tex', MAIN, 500);
	});

	test('the message goes when the name is corrected and Enter then renames', async () => {
		const { page } = texpile();
		await openSource('main.tex');
		await rename('\\label{sec:', 'two words');
		await expect(card().getByRole('alert')).toBeVisible();
		await page.keyboard.press('Control+a');
		await page.keyboard.type('sec:fixed', { delay: 20 });
		await expect(card().getByRole('alert')).toHaveCount(0);
		await page.keyboard.press('Enter');
		await disk().expectFile('main.tex', (t) => t.includes('\\label{sec:fixed}'), 'main.tex after the corrected name');
	});

	test('the Rename button submits like Enter', async () => {
		const { source, page } = texpile();
		await openSource('main.tex');
		await source.caretAfter('\\label{sec:');
		await page.keyboard.press('F2');
		await expect(cardInput()).toBeFocused();
		await page.keyboard.type('sec:button', { delay: 20 });
		await card().getByRole('button', { name: 'Rename', exact: true }).click();
		await disk().expectFile(
			'chapters/results.tex',
			(t) => t.includes('sec:button') && !t.includes('sec:intro'),
			'results.tex after the button'
		);
	});

	test('F2 where nothing can be renamed opens no card', async () => {
		const { source, page } = texpile();
		await openSource('main.tex');
		await source.caretAfter('Speed ');
		await page.keyboard.press('F2');
		await page.waitForTimeout(500);
		await expect(card()).toHaveCount(0);
		await disk().expectUnchanged('main.tex', MAIN, 500);
	});
});

test.describe('other names', () => {
	// F2 renames labels, citation keys and glossary entries; a macro or environment name is not among them
	test('F2 on a \\newcommand macro name opens no card and changes nothing', async () => {
		const { source, page } = texpile();
		await openSource('main.tex');
		await source.caretAfter('\\newcommand{\\ve');
		await page.keyboard.press('F2');
		await page.waitForTimeout(500);
		await expect(card(), 'the rename card for a macro').toHaveCount(0);
		await disk().expectUnchanged('main.tex', MAIN, 500);
	});

	test('F2 on a \\vect use opens no card and changes nothing', async () => {
		const { source, page } = texpile();
		await openSource('main.tex');
		await source.caretAfter('holds for \\ve');
		await page.keyboard.press('F2');
		await page.waitForTimeout(500);
		await expect(card(), 'the rename card for a macro use').toHaveCount(0);
		await disk().expectUnchanged('chapters/results.tex', RESULTS, 300);
	});

	test('F2 on an environment name opens no card and changes nothing', async () => {
		const { source, page } = texpile();
		await openSource('chapters/results.tex');
		await source.caretAfter('\\begin{theo');
		await page.keyboard.press('F2');
		await page.waitForTimeout(500);
		await expect(card(), 'the rename card for an environment').toHaveCount(0);
		await disk().expectUnchanged('chapters/results.tex', RESULTS, 500);
	});

	test('a citation key is renamed in both tex files and in refs.bib', async () => {
		await openSource('main.tex');
		await rename('\\cite{knu', 'knuth84');
		await disk().expectFile('refs.bib', (t) => t.includes('@book{knuth84,') && !t.includes('knuth1984'), 'refs.bib after renaming the key');
		expect(disk().read('refs.bib')).toContain('@article{lamport1986,');
		await disk().expectFile('main.tex', (t) => t.includes('\\cite{knuth84}') && !t.includes('knuth1984'), 'main.tex');
		await disk().expectFile(
			'chapters/results.tex',
			(t) => t.includes('\\cite{knuth84,lamport1986}') && !t.includes('knuth1984'),
			'results.tex'
		);
		await expect(toast(/Renamed 3 uses in 3 files/)).toBeVisible();
	});

	test('the card for a citation key is titled Rename Citation Key', async () => {
		const { source, page } = texpile();
		await openSource('main.tex');
		await source.caretAfter('\\cite{knu');
		await page.keyboard.press('F2');
		await expect(card().getByRole('dialog', { name: 'Rename Citation Key' })).toBeVisible();
		await expect(cardInput()).toHaveValue('knuth1984');
		await page.keyboard.press('Escape');
	});

	test('a citation key is renamed from the second item of a list', async () => {
		await openSource('chapters/results.tex');
		await rename('knuth1984,lamp', 'lamport86');
		await disk().expectFile('refs.bib', (t) => t.includes('@article{lamport86,') && t.includes('@book{knuth1984,'), 'refs.bib');
		await disk().expectFile('chapters/results.tex', (t) => t.includes('\\cite{knuth1984,lamport86}'), 'results.tex');
	});

	test('a citation key already in refs.bib is refused', async () => {
		await openSource('main.tex');
		await rename('\\cite{knu', 'lamport1986');
		await expect(toast('The name lamport1986 is already defined')).toBeVisible();
		await disk().expectUnchanged('main.tex', MAIN, 500);
		expect(disk().read('refs.bib')).toBe(BIB);
	});

	test('a citation key with a comma is invalid', async () => {
		const { page } = texpile();
		await openSource('main.tex');
		await rename('\\cite{knu', 'a,b');
		await expect(card().getByRole('alert')).toContainText('Remove spaces and these characters');
		await page.keyboard.press('Escape');
		expect(disk().read('refs.bib')).toBe(BIB);
	});

	test('a glossary key is renamed in its definition and its uses', async () => {
		await openSource('main.tex');
		await rename('\\gls{la', 'texsys');
		const main = await disk().expectFile(
			'main.tex',
			(t) => t.includes('\\newglossaryentry{texsys}') && t.includes('\\gls{texsys}'),
			'main.tex'
		);
		expect(main).toContain('name={LaTeX}');
		expect(main).not.toContain('{latex}');
		await disk().expectFile('chapters/results.tex', (t) => t.includes('\\gls{texsys}') && !t.includes('\\gls{latex}'), 'results.tex');
	});

	test('the card for a glossary entry is titled Rename Glossary Entry', async () => {
		const { source, page } = texpile();
		await openSource('main.tex');
		await source.caretAfter('\\newglossaryentry{la');
		await page.keyboard.press('F2');
		await expect(card().getByRole('dialog', { name: 'Rename Glossary Entry' })).toBeVisible();
		await page.keyboard.press('Escape');
	});
});

test.describe('undoing a rename across files', () => {
	const RENAMED_MAIN = MAIN.replace('\\label{sec:intro}', '\\label{sec:overview}').replace('\\ref{sec:intro}', '\\ref{sec:overview}');
	const RENAMED_RESULTS = RESULTS.replaceAll('{sec:intro', '{sec:overview').replace('\\cref{sec:intro,', '\\cref{sec:overview,');

	async function renameIntro(): Promise<void> {
		await openSource('main.tex');
		await renameSettled('\\label{sec:', 'sec:overview');
		await diskIs({ 'main.tex': RENAMED_MAIN, 'chapters/results.tex': RENAMED_RESULTS }, 'after the rename');
	}

	test('Ctrl+Z undoes the rename in every file on disk', async () => {
		const { page } = texpile();
		await renameIntro();
		await page.keyboard.press('Control+z');
		await diskIs({ 'main.tex': MAIN, 'chapters/results.tex': RESULTS }, 'after Ctrl+Z');
	});

	test('Ctrl+Shift+Z redoes it in every file', async () => {
		const { page } = texpile();
		await renameIntro();
		await page.keyboard.press('Control+z');
		await diskIs({ 'main.tex': MAIN, 'chapters/results.tex': RESULTS }, 'after Ctrl+Z');
		await page.keyboard.press('Control+Shift+KeyZ');
		await diskIs({ 'main.tex': RENAMED_MAIN, 'chapters/results.tex': RENAMED_RESULTS }, 'after redo');
	});

	test('undo, redo and undo again ends where it began', async () => {
		const { page, source } = texpile();
		await renameIntro();
		await page.keyboard.press('Control+z');
		await diskIs({ 'main.tex': MAIN, 'chapters/results.tex': RESULTS }, 'first undo');
		await page.keyboard.press('Control+Shift+KeyZ');
		await diskIs({ 'main.tex': RENAMED_MAIN, 'chapters/results.tex': RENAMED_RESULTS }, 'redo');
		await page.keyboard.press('Control+z');
		await diskIs({ 'main.tex': MAIN, 'chapters/results.tex': RESULTS }, 'second undo');
		expect(await source.text()).toBe(MAIN);
	});

	test('the Undo button of the toast undoes the rename in every file', async () => {
		await renameIntro();
		await toast(/Renamed 4 uses in 2 files/)
			.getByRole('button', { name: 'Undo' })
			.click();
		await diskIs({ 'main.tex': MAIN, 'chapters/results.tex': RESULTS }, 'after the toast Undo');
	});

	test('the editor text follows the undo and the redo', async () => {
		const { page, source } = texpile();
		await renameIntro();
		await page.keyboard.press('Control+z');
		await expect.poll(() => source.text()).toBe(MAIN);
		await diskIs({ 'chapters/results.tex': RESULTS }, 'the other file after the undo');
		await page.keyboard.press('Control+Shift+KeyZ');
		await expect.poll(() => source.text()).toBe(RENAMED_MAIN);
	});

	test('Ctrl+Z after more typing undoes the typing first and the rename second', async () => {
		const { page, source } = texpile();
		await renameIntro();
		await source.caretAfter('Speed is ');
		await texpile().page.keyboard.insertText('really ');
		await disk().expectFile('main.tex', (t) => t.includes('Speed is really '), 'the typing reached the disk');
		await page.keyboard.press('Control+z');
		await diskIs({ 'main.tex': RENAMED_MAIN, 'chapters/results.tex': RENAMED_RESULTS }, 'after the first Ctrl+Z, the rename stays');
		await page.keyboard.press('Control+z');
		await diskIs({ 'main.tex': MAIN, 'chapters/results.tex': RESULTS }, 'after the second Ctrl+Z');
	});

	test('typing before the rename stays when the rename is undone', async () => {
		const { page, source } = texpile();
		await openSource('main.tex');
		await source.caretAfter('Speed is ');
		await texpile().page.keyboard.insertText('really ');
		await page.waitForTimeout(700);
		await renameSettled('\\label{sec:', 'sec:overview');
		await disk().expectFile('chapters/results.tex', (t) => t.includes('sec:overview'), 'results.tex after the rename');
		await page.keyboard.press('Control+z');
		await disk().expectFile('chapters/results.tex', (t) => t === RESULTS, 'results.tex after the undo');
		await disk().expectFile('main.tex', (t) => t === MAIN.replace('Speed is ', 'Speed is really '), 'main.tex keeps what was typed before');
	});

	test('a citation key rename undoes in the tex files and in refs.bib', async () => {
		const { page } = texpile();
		await openSource('main.tex');
		await renameSettled('\\cite{knu', 'knuth84');
		await disk().expectFile('refs.bib', (t) => t.includes('knuth84'), 'refs.bib after the rename');
		await page.keyboard.press('Control+z');
		await diskIs({ 'main.tex': MAIN, 'chapters/results.tex': RESULTS, 'refs.bib': BIB }, 'after Ctrl+Z');
	});

	test('a citation key rename redoes in refs.bib', async () => {
		const { page } = texpile();
		await openSource('main.tex');
		await renameSettled('\\cite{knu', 'knuth84');
		await disk().expectFile('refs.bib', (t) => t.includes('knuth84'), 'refs.bib after the rename');
		await page.keyboard.press('Control+z');
		await diskIs({ 'refs.bib': BIB }, 'after Ctrl+Z');
		await page.keyboard.press('Control+Shift+KeyZ');
		await disk().expectFile('refs.bib', (t) => t.includes('@book{knuth84,'), 'refs.bib after the redo');
		await disk().expectFile('chapters/results.tex', (t) => t.includes('\\cite{knuth84,lamport1986}'), 'results.tex after the redo');
	});

	test('a glossary rename undoes in both files', async () => {
		const { page } = texpile();
		await openSource('main.tex');
		await renameSettled('\\gls{la', 'texsys');
		await disk().expectFile('chapters/results.tex', (t) => t.includes('texsys'), 'results.tex after the rename');
		await page.keyboard.press('Control+z');
		await diskIs({ 'main.tex': MAIN, 'chapters/results.tex': RESULTS }, 'after Ctrl+Z');
	});

	test('Ctrl+Z in the visual editor undoes the rename in every file too', async () => {
		const { page } = texpile();
		await renameIntro();
		await page.getByRole('button', { name: 'Visual', exact: true }).first().click();
		await page.locator('.ProseMirror').first().waitFor();
		await page.locator('.ProseMirror p', { hasText: 'Speed is' }).first().click();
		await page.keyboard.press('Control+z');
		await diskIs({ 'main.tex': MAIN, 'chapters/results.tex': RESULTS }, 'after Ctrl+Z in the visual editor');
	});

	test('a rename made in the fragment undoes from the fragment', async () => {
		const { page } = texpile();
		await openSource('chapters/results.tex');
		await renameSettled('Section~\\ref{sec:', 'sec:begin');
		await disk().expectFile('main.tex', (t) => t.includes('sec:begin'), 'main.tex after the rename');
		await page.keyboard.press('Control+z');
		await diskIs({ 'main.tex': MAIN, 'chapters/results.tex': RESULTS }, 'after Ctrl+Z in the fragment');
	});

	test('a second rename undoes before the first', async () => {
		const { page } = texpile();
		await openSource('main.tex');
		await renameSettled('\\label{sec:', 'sec:one');
		await disk().expectFile('chapters/results.tex', (t) => t.includes('sec:one'), 'first rename');
		await renameSettled('\\label{eq:', 'eq:two');
		await disk().expectFile('chapters/results.tex', (t) => t.includes('eq:two'), 'second rename');
		await page.keyboard.press('Control+z');
		await disk().expectFile('chapters/results.tex', (t) => t.includes('eq:energy') && t.includes('sec:one'), 'results.tex after one undo');
		await page.keyboard.press('Control+z');
		await diskIs({ 'main.tex': MAIN, 'chapters/results.tex': RESULTS }, 'after two undos');
	});
});

test.describe('edge cases', () => {
	test('every reference command follows a label rename and nothing else does', async () => {
		await openSource('edge-refs.tex');
		await renameSettled('\\label{sec:', 'sec:new');
		const main = await disk().expectFile('edge-refs.tex', (t) => t.includes('\\label{sec:new}'), 'edge-refs.tex after the rename');
		for (const use of ['\\ref', '\\autoref', '\\Cref', '\\nameref', '\\pageref', '\\vref', '\\hyperref[sec:new]']) {
			expect(main, `${use} after the rename`).toContain(use.includes('[') ? use : `${use}{sec:new}`);
		}
		// a longer name that starts the same is another label
		expect(main).toContain('\\label{sec:intro2}');
		expect(main).toContain('\\ref{sec:intro2}');
		expect(main).toContain('\\ref{sec:intro-extra}');
		// verbatim text keeps its words
		expect(main).toContain('\\begin{verbatim}\n\\ref{sec:intro}\n\\end{verbatim}');
		const part = await disk().expectFile('edge-refs-part.tex', (t) => t.includes('sec:new'), 'edge-refs-part.tex after the rename');
		expect(part).toBe('\\subsection{B}\\label{sec:intro-extra}\nBack to \\ref{sec:new} and \\cref{sec:new,sec:intro2}.\n');
	});

	test('a commented-out \\ref follows the rename', async () => {
		await openSource('edge-refs.tex');
		await renameSettled('\\label{sec:', 'sec:fresh');
		const main = await disk().expectFile('edge-refs.tex', (t) => t.includes('\\label{sec:fresh}'), 'edge-refs.tex after the rename');
		expect(main).toContain('% commented \\ref{sec:fresh}');
	});

	test('undoing that rename puts verbatim, comment and the part file back byte for byte', async () => {
		const { page } = texpile();
		await openSource('edge-refs.tex');
		await renameSettled('\\label{sec:', 'sec:again');
		await disk().expectFile('edge-refs-part.tex', (t) => t.includes('sec:again'), 'the part file after the rename');
		await page.keyboard.press('Control+z');
		await diskIs({ 'edge-refs.tex': REFS_MAIN, 'edge-refs-part.tex': REFS_PART }, 'after Ctrl+Z');
	});

	test('a citation key follows every cite command and the crossref of another entry', async () => {
		await openSource('edge-cites.tex');
		await renameSettled('\\cite[p.~3]{sm', 'jones');
		const tex = await disk().expectFile('edge-cites.tex', (t) => t.includes('{jones}'), 'edge-cites.tex after the rename');
		expect(tex).toBe(
			CITES_MAIN.replace('{smith}', '{jones}')
				.replace('{smith}', '{jones}')
				.replace('{smith,smith2}', '{jones,smith2}')
				.replace('{smith}{smith2}', '{jones}{smith2}')
				.replace('{smith}', '{jones}')
				.replace('{smith}', '{jones}')
		);
		const bib = await disk().expectFile('edge-cites.bib', (t) => t.includes('@book{jones,'), 'edge-cites.bib after the rename');
		expect(bib).toBe(CITES_BIB.replace('@book{smith,', '@book{jones,').replace('crossref = {smith}', 'crossref = {jones}'));
		expect(bib).toContain('title = {About smith}');
		expect(bib).toContain('@book{smith2,');
	});

	test('undoing a citation key rename restores the .bib bytes', async () => {
		const { page } = texpile();
		await openSource('edge-cites.tex');
		await renameSettled('\\parencite{sm', 'jones');
		await disk().expectFile('edge-cites.bib', (t) => t.includes('@book{jones,'), 'edge-cites.bib after the rename');
		await page.keyboard.press('Control+z');
		await diskIs({ 'edge-cites.tex': CITES_MAIN, 'edge-cites.bib': CITES_BIB }, 'after Ctrl+Z');
	});

	test('a glossary key follows \\gls, \\Gls, \\glspl and \\glsdesc, not a longer key or a plain word', async () => {
		await openSource('edge-gloss.tex');
		await renameSettled('\\gls{la', 'tex');
		const text = await disk().expectFile('edge-gloss.tex', (t) => t.includes('\\newglossaryentry{tex}'), 'edge-gloss.tex after the rename');
		expect(text).toContain('The \\gls{tex} and \\Gls{tex} and \\glspl{tex} and \\glsdesc{tex} and \\gls{latexcode}.');
		expect(text).toContain('\\newglossaryentry{latexcode}{name={code},description={the latex word stays}}');
		expect(text).toContain('name={LaTeX}');
	});

	test('a CRLF file and its part keep their CRLF line ends through a rename and its undo', async () => {
		const { page } = texpile();
		await openSource('edge-crlf.tex');
		await renameSettled('\\label{sec:', 'sec:lf');
		await disk().expectFile('edge-crlf-part.tex', (t) => t.includes('sec:lf'), 'the part file after the rename');
		await disk().expectFile('edge-crlf.tex', (t) => t.includes('sec:lf'), 'the main file after the rename');
		const bytes = (rel: string) => disk().readBytes(rel).toString('latin1');
		expect(bytes('edge-crlf.tex'), 'the main file keeps CRLF').toBe(CRLF_MAIN.replaceAll('sec:crlf', 'sec:lf'));
		expect(bytes('edge-crlf-part.tex'), 'the part file keeps CRLF').toBe(CRLF_PART.replaceAll('sec:crlf', 'sec:lf'));
		await page.keyboard.press('Control+z');
		await disk().expectFile('edge-crlf-part.tex', (t) => t === CRLF_PART, 'the part file after the undo');
		await disk().expectFile('edge-crlf.tex', (t) => t === CRLF_MAIN, 'the main file after the undo');
	});

	test('a label with accented letters renames and leaves the longer one alone', async () => {
		await openSource('edge-uni.tex');
		await renameSettled('\\label{sec:mü', 'sec:größe');
		const text = await disk().expectFile('edge-uni.tex', (t) => t.includes('\\label{sec:größe}'), 'edge-uni.tex after the rename');
		expect(text).toContain('\\ref{sec:größe} and \\ref{sec:müller2}');
		expect(text).toContain('\\label{sec:müller2}');
	});

	test('undo after the other file changed on disk leaves the files consistent', async () => {
		const { page, source } = texpile();
		await openSource('edge-ext.tex');
		await renameSettled('\\label{sec:', 'sec:moved');
		await disk().expectFile('edge-ext-part.tex', (t) => t.includes('sec:moved'), 'the part file after the rename');
		disk().write('edge-ext-part.tex', 'Part \\ref{sec:moved} text, edited elsewhere.\n');
		await page.waitForTimeout(800);
		await page.keyboard.press('Control+z');
		await page.waitForTimeout(1500);
		const main = (await source.text()).includes('\\label{sec:moved}') ? 'moved' : 'ext';
		const part = disk().read('edge-ext-part.tex').includes('sec:moved') ? 'moved' : 'ext';
		expect(part, `a ref in the part file ('${part}') must name the label in the main file ('${main}')`).toBe(main);
	});
});

test.describe('with a main file chosen', () => {
	const mainFileNow = () =>
		texpile().page.evaluate(
			async () => (await import(/* @vite-ignore */ '/src/lib/workspace/workspaceStore.ts' as string)).mainFile.current
		);

	async function chooseMain(): Promise<void> {
		const { page } = texpile();
		if (await mainFileNow()) return;
		await page.getByText('main.tex', { exact: true }).first().click({ button: 'right' });
		await page.getByRole('menuitem', { name: 'Set as Main File' }).click();
		await expect.poll(mainFileNow).toContain('main.tex');
	}

	// the folder is shared with the other tests, which start with no main file
	test.afterEach(async () => {
		const { page } = texpile();
		if (!(await mainFileNow())) return;
		for (let attempt = 0; attempt < 3 && (await mainFileNow()); attempt++) {
			await page.keyboard.press('Escape');
			await page.getByText('main.tex', { exact: true }).first().click({ button: 'right' });
			await page.getByRole('menuitem', { name: 'Unset Main File' }).click();
			await page.waitForTimeout(500);
		}
		await expect.poll(mainFileNow).toBeNull();
	});

	test('F2 in the fragment renames across the main file and the fragment', async () => {
		const { page } = texpile();
		await chooseMain();
		await openSource('chapters/results.tex');
		await renameSettled('Section~\\ref{sec:', 'sec:chosen');
		await disk().expectFile('main.tex', (t) => !t.includes('sec:intro') && count(t, 'sec:chosen') === 2, 'main.tex after the rename');
		await disk().expectFile(
			'chapters/results.tex',
			(t) => !t.includes('sec:intro') && count(t, 'sec:chosen') === 2,
			'results.tex after the rename'
		);
		await page.keyboard.press('Control+z');
		await diskIs({ 'main.tex': MAIN, 'chapters/results.tex': RESULTS }, 'after Ctrl+Z');
		// the missing figures/plot.png logs a 403 once a main file is chosen: held by a test in visualEditor.spec.ts
		const rest = texpile()
			.takeErrors()
			.filter((e) => !/status of (403 \(Forbidden\)|404 \(Not Found\))/.test(e));
		expect(rest, 'page or console errors other than the missing image').toEqual([]);
	});

	test('a document that main.tex does not include renames inside its own files', async () => {
		await chooseMain();
		await openSource('edge-refs.tex');
		await renameSettled('\\label{sec:', 'sec:own');
		await disk().expectFile('edge-refs-part.tex', (t) => t.includes('sec:own'), 'the part of the other document');
		expect(disk().read('main.tex')).toBe(MAIN);
		expect(disk().read('chapters/results.tex')).toBe(RESULTS);
		texpile().takeErrors();
	});
});
