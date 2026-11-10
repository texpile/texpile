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

const ORIGINAL: Record<string, string> = { 'main.tex': MAIN, 'chapters/results.tex': RESULTS };

const texpile = useTexpile({ files: ORIGINAL });

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

test('renaming from the \\label changes the definition and every \\ref and \\cref in both files on disk, and Ctrl+Z puts both back', async () => {
	const { page } = texpile();
	await openSource('main.tex');
	await renameSettled('\\label{sec:', 'sec:overview');
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
	await page.keyboard.press('ControlOrMeta+z');
	await diskIs({ 'main.tex': MAIN, 'chapters/results.tex': RESULTS }, 'after Ctrl+Z');
});
