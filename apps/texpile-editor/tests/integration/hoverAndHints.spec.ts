import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURE } from './driver/launch';
import {
	activeFile,
	hoverReading,
	insertAfter,
	lineOfCaret,
	openFile,
	pointMouseAt,
	updateSetting,
	waitForDiagnostic,
	withFile,
	type HoverReading
} from './driver/cardHelpers';
import type { SourceEditor } from './driver/sourceEditor';
import { useTexpile } from './driver/useTexpile';

const PLOT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="red"/></svg>';
// the chapter's figure exists, so opening the chapter does not ask the file server for a missing image
const RESULTS = fs.readFileSync(path.join(FIXTURE, 'chapters/results.tex'), 'utf8').replace('plot.png', 'plot.svg');
const texpile = useTexpile({ files: { 'figures/plot.svg': PLOT_SVG, 'chapters/results.tex': RESULTS } });

// the first time the chapter shows its figure the file server answers 403 for the candidate folder that has none
test.beforeAll(async () => {
	const { source, page, takeErrors } = texpile();
	await openFile(source, 'chapters/results.tex');
	await page.waitForTimeout(2500);
	await openFile(source, 'main.tex');
	takeErrors();
});

/** inserts `text` after the first `Speed is` of main.tex (or `Body text.` of the chapter), hovers `anchor` in it, puts the file back */
async function hoverInserted(file: string, text: string, anchor: string, offset = 2, readMacros = false): Promise<HoverReading> {
	const { source, page } = texpile();
	return withFile(source, file, async () => {
		await insertAfter(source, file === 'main.tex' ? 'Speed is' : 'Body text.', text);
		if (readMacros) {
			// the first look-up of a changed text starts the read of its macros and shows the earlier read
			await hoverReading(source, anchor, { offset });
			await page.waitForTimeout(MACRO_READ_MS);
		}
		return hoverReading(source, anchor, { offset });
	});
}

async function hoverWritten(file: string, anchor: string, offset = 2): Promise<HoverReading> {
	const { source } = texpile();
	return withFile(source, file, () => hoverReading(source, anchor, { offset }));
}

const MACRO_READ_MS = 1500;

// the macros the document defines are read by a worker that starts with the first file
async function waitForMacroWorker(): Promise<void> {
	const { source, page } = texpile();
	await openFile(source, 'main.tex');
	await page.waitForTimeout(6000);
}

test.describe('hover cards', () => {
	test.beforeAll(waitForMacroWorker);

	test('a package command shows its signature and the manual text', async () => {
		const h = await hoverInserted('main.tex', ' \\marginnote{x}', '\\marginnote{x}', 3);
		expect(h.text).toContain('\\marginnote');
		expect(h.text).toMatch(/margin note/i);
	});

	test('a command with arguments shows their shape', async () => {
		expect((await hoverInserted('main.tex', ' \\textbf{x}', '\\textbf', 3)).text).toBe('\\textbf{}');
		expect((await hoverInserted('main.tex', ' $\\frac{a}{b}$', '\\frac', 2)).text).toBe('\\frac{}{}');
	});

	test('a booktabs rule shows its shape', async () => {
		expect((await hoverInserted('main.tex', ' \\toprule', '\\toprule', 3)).text).toContain('\\toprule');
	});

	test('a section heading shows both its arguments', async () => {
		expect((await hoverWritten('main.tex', '\\section{Intro', 3)).text).toBe('\\section[]{}');
	});

	test('a math symbol shows its glyph and name', async () => {
		const h = await hoverInserted('main.tex', ' $\\alpha$', '\\alpha', 2);
		expect(h.text).toContain('α');
		expect(h.text).toContain('small alpha');
	});

	test('a plain letter shows nothing', async () => {
		expect((await hoverWritten('main.tex', 'E = mc^2', 1)).text).toBe('');
	});

	test('plain prose shows nothing', async () => {
		expect((await hoverWritten('main.tex', 'Speed is', 3)).text).toBe('');
	});

	test("the main file's own macro shows, in a chapter, the file it is defined in", async () => {
		const h = await hoverWritten('chapters/results.tex', '\\vect{v}', 2);
		expect(h.text).toContain('\\vect');
		expect(h.text).toContain('(main.tex)');
	});

	test("the document's own macro with an optional argument shows its definition", async () => {
		const h = await hoverInserted('main.tex', ' \\note{x}', '\\note{x}', 2, true);
		expect(h.text).toContain('\\note');
		expect(h.text).toContain('(defined in this file)');
	});

	test('a command from a folder package file names that file', async () => {
		const h = await hoverInserted('chapters/results.tex', ' \\qamark{x}', '\\qamark', 3, true);
		expect(h.text).toContain('\\qamark');
		expect(h.text).toContain('qatools.sty');
	});

	test('a command a folder package defines without arguments names that file', async () => {
		expect((await hoverInserted('chapters/results.tex', ' \\qadone', '\\qadone', 3, true)).text).toContain('qatools.sty');
	});

	test('a command nothing defines shows only the warning card', async () => {
		const { source } = texpile();
		const h = await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\zzunknown');
			await waitForDiagnostic(source, (d) => d.text.includes('zzunknown'));
			await source.page.waitForTimeout(1500);
			return hoverReading(source, '\\zzunknown', { offset: 3 });
		});
		expect(h.text).not.toContain('(defined');
		expect(h.text).toContain('Define \\zzunknown or load a package that provides it.');
	});

	test('a cite key shows its bibliography entry', async () => {
		const h = await hoverInserted('main.tex', ' \\cite{knuth1984}', 'knuth1984', 3);
		expect(h.text).toContain('knuth1984');
		expect(h.text).toContain('author: Donald E. Knuth');
		expect(h.text).toContain('title: The TeXbook');
		expect(h.text).toContain('publisher: Addison-Wesley');
		expect(h.text).toContain('year: 1984');
	});

	test('the second key of a cite list shows its own entry', async () => {
		const h = await hoverInserted('main.tex', ' \\cite{knuth1984,lamport1986}', 'lamport1986', 3);
		expect(h.text).toContain('author: Leslie Lamport');
		expect(h.text).not.toContain('Knuth');
	});

	test('an unknown cite key shows no entry', async () => {
		const h = await hoverInserted('main.tex', ' \\cite{nobody}', 'nobody', 3);
		expect(h.text).not.toContain('author:');
	});

	test('a ref to an equation shows it rendered as math', async () => {
		const h = await hoverInserted('main.tex', ' \\ref{eq:energy}', 'eq:energy', 3);
		expect(h.html).toContain('ML__');
		expect(h.text).toContain('E=mc');
	});

	test('a ref to a section shows the heading that carries the label', async () => {
		expect((await hoverInserted('main.tex', ' \\ref{sec:intro}', 'sec:intro', 3)).text).toContain('\\section{Introduction}');
	});

	test('a ref to a label in another file shows its context and the file', async () => {
		const h = await hoverInserted('main.tex', ' \\ref{fig:plot}', 'fig:plot', 3);
		expect(h.text).toContain('\\caption{A plot.}');
		expect(h.text).toContain('results.tex');
	});

	test('a ref to a theorem in another file shows the theorem', async () => {
		const h = await hoverInserted('main.tex', ' \\ref{thm:main}', 'thm:main', 3);
		expect(h.text).toContain('\\begin{theorem}');
		expect(h.text).toContain('A result.');
	});

	test('a ref to a label that does not exist shows nothing', async () => {
		expect((await hoverInserted('main.tex', ' \\ref{nolabel}', 'nolabel', 3)).text).toBe('');
	});

	test('a glossary key shows its description', async () => {
		const h = await hoverInserted('main.tex', ' \\gls{latex}', '\\gls{latex}', 7);
		expect(h.text).toContain('latex');
		expect(h.text).toContain('a typesetting system');
	});

	test('a glossary key that is not defined shows nothing', async () => {
		expect((await hoverInserted('main.tex', ' \\gls{nokey}', '\\gls{nokey}', 7)).text).toBe('');
	});

	test('the glossary command itself shows its shape', async () => {
		expect((await hoverInserted('main.tex', ' \\gls{latex}', '\\gls{latex}', 2)).text).toBe('\\gls[]{}[]');
	});

	test('a package name shows what the package is for and its page', async () => {
		const h = await hoverWritten('main.tex', 'booktabs', 3);
		expect(h.text).toContain('booktabs');
		expect(h.text).toContain('Professional-looking table rules');
		expect(h.text).toContain('https://ctan.org/pkg/booktabs');
	});

	test('the second package of a list shows its own card', async () => {
		const h = await hoverInserted('main.tex', ' \\usepackage{booktabs,siunitx}', 'siunitx}', 3);
		expect(h.text).toContain('Units and numbers formatting');
		expect(h.text).not.toContain('table rules');
	});

	test('a package option name shows nothing of the package', async () => {
		expect((await hoverWritten('main.tex', 'margin=2cm', 3)).text).toBe('');
	});

	test('a class name shows what the class is for', async () => {
		const h = await hoverWritten('main.tex', '{article}', 3);
		expect(h.text).toContain('article');
		expect(h.text).toContain('Standard: papers, short reports');
	});

	test('a package without catalog data shows nothing', async () => {
		expect((await hoverWritten('main.tex', 'qatools}', 3)).text).toBe('');
	});

	test('a graphic shows the image', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\includegraphics{figures/plot.svg}');
			await pointMouseAt(source, 'figures/plot.svg', 3);
			const image = page.locator('.cm-tooltip-hover img');
			await expect(image).toBeVisible();
			await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
			await page.mouse.move(2, 2);
		});
	});

	test('the card closes when the mouse moves off the word', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\marginnote{x}');
			const h = await hoverReading(source, '\\marginnote{x}', { offset: 3, keep: true });
			expect(h.text).toContain('\\marginnote');
			await page.mouse.move(700, 760, { steps: 6 });
			await expect(page.locator('.cm-tooltip-hover')).toHaveCount(0);
		});
	});

	test('the card follows the word under the mouse', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\textbf{a} \\marginnote{x}');
			expect((await hoverReading(source, '\\textbf', { offset: 3 })).text).toBe('\\textbf{}');
			expect((await hoverReading(source, '\\marginnote', { offset: 3 })).text).toContain('margin note');
			await page.mouse.move(2, 2);
		});
	});

	test('hovering changes nothing in the file', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			const before = await source.text();
			await hoverReading(source, '\\section{Intro', { offset: 3 });
			expect(await source.text()).toBe(before);
		});
	});
});

async function hintOf(source: SourceEditor): Promise<{ text: string; active: string[]; activeIndex: number }> {
	const { page } = source;
	return {
		text: await source.hint(),
		active: await page.locator('.cm-argument-hint-active').allInnerTexts(),
		activeIndex: await page
			.locator('.cm-argument-hint code > span')
			.evaluateAll((els) => els.findIndex((e) => e.classList.contains('cm-argument-hint-active')))
	};
}

/** the hint once it shows, or the empty hint */
async function shownHint(source: SourceEditor, timeout = 5000): Promise<Awaited<ReturnType<typeof hintOf>>> {
	await expect
		.poll(() => source.hint(), { timeout })
		.not.toBe('')
		.catch(() => {});
	return hintOf(source);
}

// VS Code's Trigger Parameter Hints
const SHOW_HINT = 'ControlOrMeta+Shift+Space';

/** the hint after the editor had time to show one; for the cases where none is expected */
async function quietHint(source: SourceEditor): Promise<string> {
	await source.page.waitForTimeout(1200);
	return source.hint();
}

test.describe('argument hints', () => {
	test.beforeAll(waitForMacroWorker);

	test.afterEach(async () => {
		const { source, page } = texpile();
		await source.press('Escape');
		await updateSetting(page, { argumentHints: true });
	});

	test('a package command shows all its arguments with the one being typed in bold', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\marginnote{');
			const hint = await shownHint(source);
			expect(hint.text).toBe('\\marginnote[left text]{text}[vertical offset]');
			expect(hint.active).toEqual(['{text}']);
		});
	});

	test('a math command shows its argument slots', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('$\\frac{');
			const hint = await shownHint(source);
			expect(hint.text).toBe('\\frac{}{}');
			expect(hint.activeIndex).toBe(0);
		});
	});

	test('the hint is on the text argument once `}{` is typed after the color', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\textcolor{red}{');
			const hint = await shownHint(source);
			expect(hint.text).toBe('\\textcolor[model-list]{color}{text}');
			expect(hint.active).toEqual(['{text}']);
		});
	});

	test('the hint of a fraction moves from the numerator to the denominator', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('$\\frac{1');
			await expect.poll(async () => (await hintOf(source)).activeIndex).toBe(0);
			await source.type('}{');
			await expect.poll(async () => (await hintOf(source)).activeIndex).toBe(1);
		});
	});

	test('the caret moved into an argument shows no hint until the shortcut asks for it', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\textcolor{red}{abc}');
			await source.caretAfter('\\textcolor{re');
			expect(await quietHint(source)).toBe('');
			await source.press(SHOW_HINT);
			await expect.poll(async () => (await hintOf(source)).active).toEqual(['{color}']);
		});
	});

	test("the document's own macro shows its optional and required arguments", async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\note[blue]{');
			const hint = await shownHint(source);
			expect(hint.text).toBe('\\note[]{}');
			expect(hint.active).toEqual(['{}']);
		});
	});

	test("the document's own macro with its optional argument skipped still shows the hint", async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\note{');
			const hint = await shownHint(source);
			expect(hint.text).toBe('\\note[]{}');
			expect(hint.activeIndex).toBe(1);
		});
	});

	test('a macro with one argument shows one slot', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('$\\vect{');
			expect((await shownHint(source)).text).toBe('\\vect{}');
		});
	});

	test('a macro of a folder package file shows its arguments', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\qamark[2]{');
			expect((await shownHint(source)).text).toBe('\\qamark[]{}');
		});
	});

	test('an environment shows the arguments after its name', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\begin{tabular}{');
			const hint = await shownHint(source);
			expect(hint.text).toBe('\\begin{tabular}[]{}');
			expect(hint.activeIndex).toBe(1);
		});
	});

	test("the document's own environment shows its argument", async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\begin{qabox}{');
			expect((await shownHint(source)).text).toBe('\\begin{qabox}{}');
		});
	});

	test('a graphics command shows its option and file arguments', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\includegraphics[width=1cm]{');
			const hint = await shownHint(source);
			expect(hint.text).toBe('\\includegraphics[options]{file}');
			expect(hint.active).toEqual(['{file}']);
		});
	});

	test('a citation shows the notes and the key', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\cite[');
			expect((await shownHint(source)).text).toBe('\\cite[prenote][postnote]{key}');
		});
	});

	test('a section shows its short title and title', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\section{');
			const hint = await shownHint(source);
			expect(hint.text).toBe('\\section[short title]{title}');
			expect(hint.active).toEqual(['{title}']);
		});
	});

	test('the hint shows in a chapter file for a macro of the main preamble', async () => {
		const { source } = texpile();
		await withFile(source, 'chapters/results.tex', async () => {
			await source.caretAfter('Body text.');
			await source.type(' $\\vect{');
			expect((await shownHint(source, 8000)).text).toBe('\\vect{}');
		});
	});

	test('Escape hides the hint', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\textit{');
			expect((await shownHint(source)).text).toBe('\\textit{text}');
			await source.press('Escape');
			await expect.poll(() => source.hint()).toBe('');
		});
	});

	test('the hint stays hidden while typing in the same call', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\textcolor{red}{');
			await shownHint(source);
			await source.press('Escape');
			await source.type('abc');
			expect(await quietHint(source)).toBe('');
			await source.press('ArrowLeft');
			expect(await quietHint(source)).toBe('');
		});
	});

	test('the hint stays hidden when the caret moves to another argument of the same call', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\textcolor{red}{abc}');
			await source.caretAfter('\\textcolor{re');
			await source.press(SHOW_HINT);
			await shownHint(source);
			await source.press('Escape');
			await source.caretAfter('{abc');
			expect(await quietHint(source)).toBe('');
		});
	});

	test('the hint comes back once the caret enters another call', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\textit{a}');
			await source.caretAfter('\\textit{');
			await source.press(SHOW_HINT);
			await shownHint(source);
			await source.press('Escape');
			await source.caretAfter('\\textit{a}');
			await source.type(' \\textbf{');
			expect((await shownHint(source)).text).toBe('\\textbf{text}');
		});
	});

	test('a click closes the hint and the shortcut opens it again', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\textit{a} \\textbf{b}');
			await source.caretAfter('\\textit{');
			await source.press(SHOW_HINT);
			await expect.poll(() => source.hint()).toBe('\\textit{text}');
			await source.clickAfter('\\textbf{');
			expect(await quietHint(source)).toBe('');
			await source.press(SHOW_HINT);
			await expect.poll(() => source.hint()).toBe('\\textbf{text}');
		});
	});

	test('an open hint follows the arrow keys into a nested call', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\textit{a \\textbf{b}}');
			await source.caretAfter('\\textit{a \\textbf');
			await source.press(SHOW_HINT);
			await expect.poll(() => source.hint()).toBe('\\textit{text}');
			await source.press('ArrowRight');
			await expect.poll(() => source.hint()).toBe('\\textbf{text}');
		});
	});

	test('the hint hides once the caret is outside the call', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\textit{a}');
			await source.type(' plain');
			expect(await quietHint(source)).toBe('');
		});
	});

	test('there is no hint with text selected', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\textit{abc}');
			await source.caretAfter('\\textit{');
			await source.press(SHOW_HINT);
			await shownHint(source);
			await source.press('Shift+ArrowRight');
			expect(await quietHint(source)).toBe('');
		});
	});

	test('there is no hint inside verbatim', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\begin{verbatim}\n\\textit{');
			expect(await quietHint(source)).toBe('');
		});
	});

	test('there is no hint inside a listing', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\begin{lstlisting}\n\\marginnote{');
			expect(await quietHint(source)).toBe('');
		});
	});

	test('the hint is back after the verbatim environment closes', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\begin{verbatim}\nx\n\\end{verbatim}\n\\textit{');
			expect((await shownHint(source)).text).toBe('\\textit{text}');
		});
	});

	test('the hint and the completion list show together, and Escape closes the list first', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\cite{kn');
			await expect.poll(async () => (await source.completions()).length).toBeGreaterThan(0);
			expect(await source.hint()).toBe('\\cite[prenote][postnote]{key}');
			await source.press('Escape');
			await expect.poll(() => source.completions().then((c) => c.length)).toBe(0);
			expect(await source.hint()).toBe('\\cite[prenote][postnote]{key}');
			await source.press('Escape');
			await expect.poll(() => source.hint()).toBe('');
		});
	});

	test('no hint shows for a command without brackets', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('$\\alpha');
			expect(await quietHint(source)).toBe('');
		});
	});

	test('the Preferences switch turns the hints off and on', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\textit{');
			expect((await shownHint(source)).text).toBe('\\textit{text}');
			await updateSetting(page, { argumentHints: false });
			await expect.poll(() => source.hint()).toBe('');
			await source.type('abc');
			expect(await quietHint(source)).toBe('');
			await updateSetting(page, { argumentHints: true });
			expect(await quietHint(source)).toBe('');
			await source.press(SHOW_HINT);
			await expect.poll(() => source.hint()).toBe('\\textit{text}');
		});
	});

	test('with the switch off no hint shows for a command typed later', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			await updateSetting(page, { argumentHints: false });
			await source.caretAfter('Speed is ');
			await source.type('\\textcolor{red}{');
			expect(await quietHint(source)).toBe('');
		});
	});

	test('the switch turned off before a file is opened shows no hint', async () => {
		const { source, page } = texpile();
		await updateSetting(page, { argumentHints: false });
		await withFile(source, 'plain.tex', async () => {
			await source.caretAfter('Text.');
			await source.type(' \\textit{');
			expect(await quietHint(source)).toBe('');
		});
	});
});

async function jumpFrom(source: SourceEditor, anchor: string): Promise<void> {
	await source.caretAfter(anchor);
	await source.page.waitForTimeout(500);
	await source.press('F12');
}

async function caretLineIs(source: SourceEditor, expected: string | RegExp): Promise<void> {
	await expect
		.poll(() => lineOfCaret(source), { timeout: 10_000 })
		.toMatch(expected instanceof RegExp ? expected : new RegExp(`^${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
}

async function fileIs(source: SourceEditor, name: string): Promise<void> {
	await expect.poll(async () => path.basename((await activeFile(source.page)) ?? ''), { timeout: 10_000 }).toBe(name);
}

test.describe('go to definition', () => {
	test('F12 on a ref jumps to its label in the same file', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\ref{eq:energy}');
			await jumpFrom(source, '\\ref{eq:en');
			await caretLineIs(source, '\\begin{equation}\\label{eq:energy}');
			await fileIs(source, 'main.tex');
		});
	});

	test('F12 on a ref jumps to a label in another file', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\ref{fig:plot}');
			await jumpFrom(source, '\\ref{fig:pl');
			await fileIs(source, 'results.tex');
			await caretLineIs(source, /\\label\{fig:plot\}/);
		});
	});

	test('F12 on a ref to a theorem lands on the theorem', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\ref{thm:main}');
			await jumpFrom(source, '\\ref{thm:ma');
			await fileIs(source, 'results.tex');
			await caretLineIs(source, '\\begin{theorem}\\label{thm:main}');
		});
	});

	test('F12 on a ref to a label that does not exist stays where it is', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\ref{nolabel}');
			await jumpFrom(source, '\\ref{nolab');
			await source.page.waitForTimeout(1500);
			await fileIs(source, 'main.tex');
			await caretLineIs(source, /\\ref\{nolabel\}/);
		});
	});

	test('F12 on a cite key opens its entry in the .bib file', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\cite{knuth1984}');
			await jumpFrom(source, '\\cite{knut');
			await fileIs(source, 'refs.bib');
			await caretLineIs(source, '@book{knuth1984,');
		});
	});

	test('F12 on the second key of a cite list opens that entry', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\cite{knuth1984,lamport1986}');
			await jumpFrom(source, 'lamport19');
			await fileIs(source, 'refs.bib');
			await caretLineIs(source, '@article{lamport1986,');
		});
	});

	test("F12 on the document's own macro jumps to its definition in the same file", async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\note{a}');
			await jumpFrom(source, 'Speed is \\not');
			await fileIs(source, 'main.tex');
			await caretLineIs(source, '\\newcommand{\\note}[2][red]');
		});
	});

	test('F12 on a macro in a chapter file jumps to its definition in the main file', async () => {
		const { source } = texpile();
		await withFile(source, 'chapters/results.tex', async () => {
			await jumpFrom(source, 'The vector $\\vec');
			await fileIs(source, 'main.tex');
			await caretLineIs(source, '\\newcommand{\\vect}[1]');
		});
	});

	test('F12 on a command of a folder package opens that file at its definition', async () => {
		const { source } = texpile();
		await withFile(source, 'chapters/results.tex', async () => {
			await insertAfter(source, 'Body text.', ' \\qamark{x}');
			await jumpFrom(source, 'Body text. \\qama');
			await fileIs(source, 'qatools.sty');
			await caretLineIs(source, '\\newcommand{\\qamark}');
		});
	});

	test('F12 on a glossary key jumps to its entry', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\gls{latex}');
			await jumpFrom(source, '\\gls{lat');
			await caretLineIs(source, '\\newglossaryentry{latex}');
		});
	});

	test('F12 on an \\input opens the file it names', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await jumpFrom(source, '\\input{chapters/res');
			await fileIs(source, 'results.tex');
			expect(await source.evalView<string>('return view.state.doc.sliceString(0, 17);')).toBe('\\section{Results}');
		});
	});

	test('F12 on a label jumps to the label itself', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await jumpFrom(source, '\\label{sec:int');
			await caretLineIs(source, '\\section{Introduction}\\label{sec:intro}');
		});
	});

	test('F12 on plain text does nothing', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await jumpFrom(source, 'Speed i');
			await source.page.waitForTimeout(800);
			await fileIs(source, 'main.tex');
			await caretLineIs(source, /^Speed is/);
		});
	});

	test('Ctrl+click on a ref jumps to its label', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\ref{eq:energy}');
			await pointMouseAt(source, 'eq:energy', 3);
			await page.keyboard.down('Control');
			await page.mouse.down();
			await page.mouse.up();
			await page.keyboard.up('Control');
			await caretLineIs(source, '\\begin{equation}\\label{eq:energy}');
		});
	});

	test('Ctrl+click on a cite key opens the .bib entry', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\cite{knuth1984}');
			await pointMouseAt(source, 'knuth1984', 3);
			await page.keyboard.down('Control');
			await page.mouse.down();
			await page.mouse.up();
			await page.keyboard.up('Control');
			await fileIs(source, 'refs.bib');
			await caretLineIs(source, '@book{knuth1984,');
		});
	});

	test('a plain click does not jump', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\ref{fig:plot}');
			await pointMouseAt(source, 'fig:plot', 3);
			await page.mouse.down();
			await page.mouse.up();
			await page.waitForTimeout(1200);
			await fileIs(source, 'main.tex');
		});
	});
});

test.describe('rename', () => {
	const files = ['main.tex', 'chapters/results.tex', 'refs.bib'];

	async function renameTo(source: SourceEditor, anchor: string, name: string): Promise<void> {
		const { page } = source;
		await source.caretAfter(anchor);
		await page.waitForTimeout(500);
		await source.press('F2');
		const input = page.locator('.cm-rename-card input');
		await expect(input).toBeVisible();
		await input.fill(name);
		await source.press('Enter');
		await expect(input).toHaveCount(0);
	}

	test.afterAll(async () => {
		// the rename went through the app, so a rename back is what puts every file as it was
		const { source } = texpile();
		await openFile(source, 'main.tex');
		for (const rel of files) {
			await expect
				.poll(() => fs.readFileSync(source.path(rel), 'utf8'), { message: `${rel} as the fixture had it`, timeout: 15_000 })
				.toBe(rel === 'chapters/results.tex' ? RESULTS : fs.readFileSync(path.join(FIXTURE, rel), 'utf8'));
		}
	});

	test('F2 on a ref renames the label in the other file too', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\ref{fig:plot}');
			await renameTo(source, '\\ref{fig:pl', 'fig:chart');
			await expect.poll(() => source.text()).toContain('\\ref{fig:chart}');
			await expect
				.poll(() => fs.readFileSync(source.path('chapters/results.tex'), 'utf8'), { timeout: 15_000 })
				.toContain('\\label{fig:chart}');
			await renameTo(source, '\\ref{fig:ch', 'fig:plot');
			await expect
				.poll(() => fs.readFileSync(source.path('chapters/results.tex'), 'utf8'), { timeout: 15_000 })
				.toContain('\\label{fig:plot}');
		});
	});

	test('F2 on a cite key renames the .bib entry too', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\cite{knuth1984}');
			await renameTo(source, '\\cite{knu', 'knuth84');
			await expect.poll(() => source.text()).toContain('\\cite{knuth84}');
			await expect.poll(() => fs.readFileSync(source.path('refs.bib'), 'utf8'), { timeout: 15_000 }).toContain('@book{knuth84,');
			await renameTo(source, '\\cite{knuth8', 'knuth1984');
			await expect.poll(() => fs.readFileSync(source.path('refs.bib'), 'utf8'), { timeout: 15_000 }).toContain('@book{knuth1984,');
		});
	});

	test('F2 on a glossary key renames its entry', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\gls{latex}');
			await renameTo(source, '\\gls{lat', 'tex');
			await expect.poll(() => source.text()).toContain('\\newglossaryentry{tex}');
			await expect.poll(() => source.text()).toContain('\\gls{tex}');
			await renameTo(source, '\\gls{te', 'latex');
			await expect.poll(() => source.text()).toContain('\\newglossaryentry{latex}');
		});
	});

	test('Escape closes the rename card and changes nothing', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\ref{fig:plot}');
			const before = await source.text();
			await source.caretAfter('\\ref{fig:pl');
			await page.waitForTimeout(400);
			await source.press('F2');
			await expect(page.locator('.cm-rename-card input')).toBeVisible();
			await page.locator('.cm-rename-card input').fill('zzz');
			await source.press('Escape');
			await expect(page.locator('.cm-rename-card input')).toHaveCount(0);
			expect(await source.text()).toBe(before);
		});
	});
});

test.describe('acro keys', () => {
	test.describe.configure({ mode: 'default' });

	test('hovering an acronym key shows its long form', async () => {
		const h = await hoverInserted('main.tex', ' \\ac{cpu}', '\\ac{cpu}', 5);
		expect(h.text, 'the hover over the key of \\ac{cpu}, which \\DeclareAcronym{cpu}{...long=central processing unit} defines').toContain(
			'central processing unit'
		);
	});

	test('F12 on an acronym key jumps to its \\DeclareAcronym', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\ac{cpu}');
			await jumpFrom(source, '\\ac{cp');
			await expect
				.poll(() => lineOfCaret(source), { message: 'the caret line after F12 on the key of \\ac{cpu}', timeout: 6000 })
				.toMatch(/^\\DeclareAcronym\{cpu\}/);
		});
	});

	test('hovering a graphic that does not exist leaves no broken image and no console error', async () => {
		const { source, page, takeErrors } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\includegraphics{figures/gone.png}');
			await pointMouseAt(source, 'figures/gone.png', 3);
			await page.waitForTimeout(1500);
			await expect(page.locator('.cm-tooltip-hover img')).toHaveCount(0);
			await page.mouse.move(2, 2);
		});
		expect(takeErrors(), 'console errors after hovering a graphic file that is not in the folder').toEqual([]);
	});
});
