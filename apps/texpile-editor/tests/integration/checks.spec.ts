import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
	hoverCard,
	insertAfter,
	moreActionsButton,
	openFile,
	resetChecks,
	waitForDiagnostic,
	waitForNoDiagnostic,
	withFile
} from './driver/cardHelpers';
import { FIXTURE } from './driver/launch';
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

const on = (needle: string) => (d: { text: string }) => d.text.includes(needle);

test.afterEach(async () => {
	await resetChecks(texpile().page);
});

test.describe('live checks fire on typed text', () => {
	test('an undefined command is marked as it is typed', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\setcion{X} ');
			const rows = await waitForDiagnostic(source, on('setcion'), 'a warning on \\setcion');
			const row = rows.find(on('setcion'))!;
			expect(row.severity).toBe('warning');
			expect(row.message).toBe('Define \\setcion or load a package that provides it.');
		});
	});
});

test.describe('the card', () => {
	test('hovering the marked range shows a card with the check name, message and fix', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' $\\mathbb{R}$');
			await waitForDiagnostic(source, on('mathbb'));
			const cards = await hoverCard(source, '\\mathbb');
			await expect(cards).toHaveCount(1);
			await expect(cards.first()).toContainText('Undefined commands');
			await expect(cards.first()).toContainText('\\mathbb comes from amsfonts.');
			await expect(cards.first().getByRole('button', { name: /usepackage\{amsfonts\}/ })).toBeVisible();
		});
	});
});

test.describe('the fix link', () => {
	test('adds the package the command needs and the warning goes away', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' $\\mathbb{R}$');
			await waitForDiagnostic(source, on('mathbb'));
			// the card is drawn again when the checks run once more, which can take the button from under a click
			await expect(async () => {
				if ((await source.text()).includes('\\usepackage{amsfonts}')) return;
				const cards = await hoverCard(source, '\\mathbb');
				await cards
					.first()
					.getByRole('button', { name: /usepackage\{amsfonts\}/ })
					.click({ timeout: 3000 });
			}).toPass();
			await expect.poll(() => source.text()).toContain('\\usepackage{amsfonts}');
			const text = await source.text();
			expect(text.indexOf('\\usepackage{amsfonts}')).toBeLessThan(text.indexOf('\\begin{document}'));
			await waitForNoDiagnostic(source, on('mathbb'), 'the \\mathbb warning gone after the fix');
		});
	});
});

test.describe('Turn off', () => {
	async function turnOffFromCard(anchor: string): Promise<void> {
		const { source } = texpile();
		const card = (await hoverCard(source, anchor)).first();
		await moreActionsButton(card).click();
		await card.getByRole('button', { name: 'Turn off' }).click();
	}

	test('is saved in the app settings', async () => {
		const { source, userData } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\setcion');
			await waitForDiagnostic(source, on('setcion'));
			await turnOffFromCard('\\setcion');
			await expect
				.poll(() => JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8')).latexChecks?.['undefined-command'], {
					timeout: 10_000
				})
				.toBe(false);
		});
	});
});

test.describe('folding', () => {
	// folds are remembered per file, so a test starts and ends with none
	async function unfoldEverything(): Promise<void> {
		const { source, page } = texpile();
		await source.evalView('view.focus();');
		await source.press('ControlOrMeta+Alt+BracketRight');
		await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(0);
		await page.waitForTimeout(700);
	}

	test.beforeEach(async () => {
		const { source } = texpile();
		for (const rel of ['chapters/results.tex', 'main.tex']) {
			await openFile(source, rel);
			await unfoldEverything();
		}
	});

	/** the fold chevron in the gutter beside the line the nth `anchor` is on, null when the line has none */
	async function foldMarkerFor(anchor: string): Promise<{ x: number; y: number } | null> {
		const { source, page } = texpile();
		const y = await source.evalView<number>(
			`const at = view.state.doc.toString().indexOf(arg); view.dispatch({ effects: view.constructor.scrollIntoView(at, { y: 'center' }) });
			 return at;`,
			anchor
		);
		expect(y, `anchor ${JSON.stringify(anchor)}`).toBeGreaterThanOrEqual(0);
		await page.waitForTimeout(300);
		return source.evalView(
			`const c = view.coordsAtPos(arg); if (!c) return null;
			 const hit = [...document.querySelectorAll('.cm-foldGutter .cm-gutterElement')].find((el) => {
				const r = el.getBoundingClientRect();
				return el.querySelector('.cm-foldMarker') && r.top <= (c.top + c.bottom) / 2 && (c.top + c.bottom) / 2 <= r.bottom;
			 });
			 const r = hit?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;`,
			await source.evalView('return view.state.doc.toString().indexOf(arg);', anchor)
		);
	}

	async function visibleText(): Promise<string> {
		return texpile().page.evaluate(() => (document.querySelector('.cm-content') as HTMLElement).innerText);
	}

	async function foldByClick(anchor: string): Promise<void> {
		const { page } = texpile();
		const marker = await foldMarkerFor(anchor);
		expect(marker, `a fold chevron beside ${JSON.stringify(anchor)}`).not.toBeNull();
		await page.mouse.click(marker!.x, marker!.y);
	}

	test('a section folds from its gutter chevron and unfolds from it', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			expect(await visibleText()).toContain('E = mc^2');
			await foldByClick('\\section{Introduction}');
			await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(1);
			expect(await visibleText()).not.toContain('E = mc^2');
			expect(await visibleText()).not.toContain('Speed is');
			await page.locator('.cm-foldPlaceholder').click();
			await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(0);
			expect(await visibleText()).toContain('E = mc^2');
		});
	});
});

test.describe('format shortcuts', () => {
	async function selectWord(word: string): Promise<void> {
		const { source } = texpile();
		await source.evalView(
			`const at = view.state.doc.toString().indexOf(arg); view.dispatch({ selection: { anchor: at, head: at + arg.length } }); view.focus();`,
			word
		);
	}

	test('a shortcut press is saved to the file on disk', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await selectWord('Speed');
			await source.press('ControlOrMeta+i');
			await expect.poll(() => fs.readFileSync(source.path('main.tex'), 'utf8'), { timeout: 10_000 }).toContain('\\textit{Speed} is');
		});
	});
});
