import { expect, test, type Locator } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
	activeFile,
	checkIsOn,
	hoverCard,
	hoverGutterMarker,
	insertAfter,
	moreActionsButton,
	openFile,
	pointMouseAt,
	resetChecks,
	settledDiagnostics,
	waitForDiagnostic,
	waitForNoDiagnostic,
	withFile
} from './driver/cardHelpers';
import { FIXTURE } from './driver/launch';
import { useTexpile } from './driver/useTexpile';

const IN_HOUSE = '\\ProvidesPackage{inhousemacros}\n\\newcommand{\\inhouselogo}{L}\n\\newcommand{\\inhousecite}[1]{#1}\n';
const PLOT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="red"/></svg>';
// the chapter's figure exists, so opening the chapter does not ask the file server for a missing image
const RESULTS = fs.readFileSync(path.join(FIXTURE, 'chapters/results.tex'), 'utf8').replace('plot.png', 'plot.svg');
const texpile = useTexpile({ files: { 'inhousemacros.sty': IN_HOUSE, 'figures/plot.svg': PLOT_SVG, 'chapters/results.tex': RESULTS } });

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

	test('a command a package defines names that package', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' $\\mathbb{R}$');
			const rows = await waitForDiagnostic(source, on('mathbb'));
			expect(rows.find(on('mathbb'))!.message).toBe('\\mathbb comes from amsfonts.');
		});
	});

	test('a package command without the package in a fragment names the package', async () => {
		const { source } = texpile();
		await withFile(source, 'plain.tex', async () => {
			await insertAfter(source, 'Text.', ' \\num{3}');
			const rows = await waitForDiagnostic(source, on('\\num{3}'));
			expect(rows.find(on('\\num{3}'))!.message).toBe('\\num comes from siunitx.');
		});
	});

	test('a command two packages define is marked without a package', async () => {
		const { source } = texpile();
		await withFile(source, 'plain.tex', async () => {
			await insertAfter(source, 'Text.', ' \\qty{1}{\\metre}');
			const rows = await waitForDiagnostic(source, on('\\qty{1}'));
			// physics and siunitx both define \qty, so no package is named
			expect(rows.find(on('\\qty{1}'))!.message).toMatch(/^Define \\qty or load a package/);
		});
	});

	test('an unknown environment is marked', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\begin{qwerty}x\\end{qwerty}');
			const rows = await waitForDiagnostic(source, on('qwerty'));
			expect(rows.find(on('qwerty'))!.message).toBe('Define the qwerty environment or load a package that provides it.');
		});
	});

	test('an environment from a package that is not loaded names the package', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\begin{wrapfigure}{r}{3cm}x\\end{wrapfigure}');
			const rows = await waitForDiagnostic(source, on('wrapfigure'));
			expect(rows.find(on('wrapfigure'))!.message).toBe('The wrapfigure environment comes from wrapfig.');
		});
	});

	test('a misspelled geometry option is marked with the option it looks like', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, '\\usepackage[margin=2cm', ',landscpe');
			const rows = await waitForDiagnostic(source, on('landscpe'));
			expect(rows.find(on('landscpe'))!.message).toBe('Did you mean landscape?');
		});
	});

	test('a misspelled class option is marked with the option it looks like', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, '\\documentclass[11pt', ',a4papr');
			const rows = await waitForDiagnostic(source, on('a4papr'));
			expect(rows.find(on('a4papr'))!.message).toBe('Did you mean a4paper?');
		});
	});

	test('a package the compile engine lacks is marked', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, '\\usepackage{qatools}', '\n\\usepackage{xy}\n\\usepackage{xetexko}');
			const rows = await waitForDiagnostic(source, on('xetexko'));
			expect(rows.find(on('\\usepackage{xy}'))!.message).toBe('xy needs pdfLaTeX or XeLaTeX.');
			expect(rows.find(on('xetexko'))!.message).toBe('xetexko needs XeLaTeX.');
		});
	});

	test('a package loaded in the wrong order is marked', async () => {
		const { source } = texpile();
		await withFile(source, 'plain.tex', async () => {
			await insertAfter(source, '\\usepackage{xcolor}', '\n\\usepackage{cleveref}\n\\usepackage{hyperref}');
			const rows = await waitForDiagnostic(source, on('{hyperref}'));
			expect(rows.find(on('{hyperref}'))!.message).toBe('Load hyperref before cleveref.');
		});
	});

	test('an unknown cite key is marked as a reference problem', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\cite{nobody}');
			const rows = await waitForDiagnostic(source, on('nobody'));
			expect(rows.find(on('nobody'))!.message).toBe('No bibliography entry has the key nobody');
		});
	});

	test('a known cite key is not marked', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\cite{knuth1984,lamport1986}');
			expect(await settledDiagnostics(source)).not.toContainEqual(expect.objectContaining({ text: expect.stringContaining('knuth1984') }));
		});
	});

	test('a missing figure is marked as an error', async () => {
		const { source } = texpile();
		await withFile(source, 'chapters/results.tex', async () => {
			await insertAfter(source, 'Body text.', '\n\\includegraphics{figures/none.png}');
			const rows = await waitForDiagnostic(source, on('none.png'));
			const row = rows.find(on('none.png'))!;
			expect(row.severity).toBe('error');
			expect(row.message).toBe('No image figures/none.png in the project');
		});
	});

	test('a label defined in another file is marked', async () => {
		const { source } = texpile();
		await withFile(source, 'chapters/results.tex', async () => {
			await insertAfter(source, 'Body text.', '\n\\label{sec:intro}');
			const rows = await waitForDiagnostic(source, on('\\label{sec:intro}'));
			expect(rows.find(on('\\label{sec:intro}'))!.message).toBe('The label sec:intro is also defined in main.tex');
		});
	});

	test('a command a chapter file uses from the folder package and the main preamble is not marked', async () => {
		const { source } = texpile();
		await withFile(source, 'chapters/results.tex', async () => {
			await insertAfter(source, 'Body text.', ' \\qamark{x} \\vect{v} \\qadone');
			const rows = await settledDiagnostics(source);
			expect(rows.filter((d) => /qamark|vect|qadone/.test(d.text) && !/includegraphics/.test(d.text))).toEqual([]);
		});
	});

	test('a command a folder package file defines is not marked', async () => {
		const { source } = texpile();
		await withFile(source, 'plain.tex', async () => {
			await insertAfter(source, 'Text.', ' \\inhouselogo \\inhousecite{a}');
			const rows = await settledDiagnostics(source);
			expect(rows.filter(on('inhouse'))).toEqual([]);
		});
	});

	test('a command the document defines itself is not marked', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\newcommand{\\mine}{x}\\mine \\vect{a} \\note{b}');
			const rows = await settledDiagnostics(source);
			expect(rows.filter((d) => /mine|vect|note/.test(d.text))).toEqual([]);
		});
	});

	test('nothing in verbatim, a comment or an at-command is marked', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\begin{verbatim}\\setcion\\end{verbatim}');
			await insertAfter(source, 'Speed is', ' % \\setcomment');
			await insertAfter(source, 'Speed is', ' \\makeatletter\\@foo\\makeatother');
			const rows = await settledDiagnostics(source);
			expect(rows.filter((d) => /setcion|setcomment|@foo/.test(d.text))).toEqual([]);
		});
	});

	test('a command is marked once however often it is used', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\setcion \\setcion \\setcion');
			const rows = await waitForDiagnostic(source, on('setcion'));
			expect(rows.filter(on('setcion'))).toHaveLength(1);
		});
	});

	test('the warning goes away once typing fixes the problem', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\setcion ');
			await waitForDiagnostic(source, on('setcion'));
			await source.press('Backspace');
			for (let i = 0; i < 8; i++) await source.press('Backspace');
			await waitForNoDiagnostic(source, on('setcion'), 'the \\setcion warning gone after deleting it');
		});
	});

	test('the warning goes away once the document defines the command', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\setcion');
			await waitForDiagnostic(source, on('setcion'));
			await insertAfter(source, '\\newcounter{step}', '\n\\newcommand{\\setcion}{x}');
			await waitForNoDiagnostic(source, (d) => d.message.includes('setcion'), 'the \\setcion warning gone after defining it');
		});
	});

	test('a misspelled option stops being marked once it is spelled right', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, '\\documentclass[11pt', ',a4papr');
			await waitForDiagnostic(source, on('a4papr'));
			await source.evalView(
				"const at = view.state.doc.toString().indexOf('a4papr'); view.dispatch({ changes: { from: at, to: at + 6, insert: 'a4paper' } });"
			);
			await waitForNoDiagnostic(source, on('a4papr'), 'the a4papr warning gone');
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

	test('a card with no fix offers none', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\setcion');
			await waitForDiagnostic(source, on('setcion'));
			const cards = await hoverCard(source, '\\setcion');
			await expect(cards.first()).toContainText('Define \\setcion or load a package that provides it.');
			await expect(cards.first().getByRole('button')).toHaveCount(1);
			await expect(moreActionsButton(cards.first())).toBeVisible();
		});
	});

	test('each check puts its own name on the card', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, '\\documentclass[11pt', ',a4papr');
			await insertAfter(source, '\\usepackage{qatools}', '\n\\usepackage{xy}');
			await waitForDiagnostic(source, on('a4papr'));
			await waitForDiagnostic(source, on('{xy}'));
			await expect(await hoverCard(source, 'a4papr', { offset: 2 })).toContainText('Package options');
			await expect(await hoverCard(source, '{xy}', { offset: 2 })).toContainText('Engine support');
		});
	});

	test('a package conflict card names the check and offers to move the package', async () => {
		const { source } = texpile();
		await withFile(source, 'plain.tex', async () => {
			await insertAfter(source, '\\usepackage{xcolor}', '\n\\usepackage{cleveref}\n\\usepackage{hyperref}');
			await waitForDiagnostic(source, on('{hyperref}'));
			const cards = await hoverCard(source, '{hyperref}', { offset: 2 });
			await expect(cards.first()).toContainText('Package conflicts');
			await expect(cards.first().getByRole('button', { name: /Move .*hyperref.* above cleveref/ })).toBeVisible();
		});
	});

	test('a reference problem card is headed Reference check and has no menu', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\cite{nobody}');
			await waitForDiagnostic(source, on('nobody'));
			const cards = await hoverCard(source, 'nobody', { offset: 2 });
			await expect(cards.first()).toContainText('Reference check');
			await expect(cards.first()).toContainText('No bibliography entry has the key nobody');
			await expect(moreActionsButton(cards.first())).toHaveCount(0);
		});
	});

	test('the gutter marker shows exactly one card for a line with one problem', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' $\\mathbb{R}$');
			await waitForDiagnostic(source, on('mathbb'));
			const tooltip = await hoverGutterMarker(source, 'Speed is');
			await expect(tooltip.locator('.card')).toHaveCount(1);
			await expect(tooltip.locator('.cm-diagnostic')).toHaveCount(1);
			await expect(tooltip.locator('.card')).toContainText('\\mathbb comes from amsfonts.');
			await expect(page.locator('.cm-tooltip-lint .card')).toHaveCount(1);
		});
	});

	test('the gutter card of a check problem has its fix and its menu', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' $\\mathbb{R}$');
			await waitForDiagnostic(source, on('mathbb'));
			const tooltip = await hoverGutterMarker(source, 'Speed is');
			await expect(tooltip.getByRole('button', { name: /usepackage\{amsfonts\}/ })).toBeVisible();
			await expect(moreActionsButton(tooltip)).toBeVisible();
		});
	});

	test('a line with two problems shows two cards in the gutter', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' $\\mathbb{R}$ \\setcion');
			await waitForDiagnostic(source, on('setcion'));
			const tooltip = await hoverGutterMarker(source, 'Speed is');
			await expect(tooltip.locator('.card')).toHaveCount(2);
		});
	});

	test('the card of one range holds only the problem of that range', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' $\\mathbb{R}$ \\setcion');
			await waitForDiagnostic(source, on('setcion'));
			const cards = await hoverCard(source, '\\setcion');
			await expect(cards).toHaveCount(1);
			await expect(cards.first()).toContainText('Define \\setcion');
			await expect(cards.first()).not.toContainText('mathbb');
		});
	});

	test('the card stays open while the mouse rests on the range', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\setcion');
			await waitForDiagnostic(source, on('setcion'));
			const cards = await hoverCard(source, '\\setcion');
			await page.waitForTimeout(5000);
			await expect(cards).toHaveCount(1);
			await expect(cards.first()).toContainText('Define \\setcion');
		});
	});

	test('the card goes away when the mouse leaves the range', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\setcion');
			await waitForDiagnostic(source, on('setcion'));
			await hoverCard(source, '\\setcion');
			await page.mouse.move(700, 700, { steps: 6 });
			await expect(page.locator('.cm-tooltip .card')).toHaveCount(0);
		});
	});
});

test.describe('the fix link', () => {
	test('adds the package the command needs and the warning goes away', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' $\\mathbb{R}$');
			await waitForDiagnostic(source, on('mathbb'));
			const cards = await hoverCard(source, '\\mathbb');
			await cards
				.first()
				.getByRole('button', { name: /usepackage\{amsfonts\}/ })
				.click();
			await expect.poll(() => source.text()).toContain('\\usepackage{amsfonts}');
			const text = await source.text();
			expect(text.indexOf('\\usepackage{amsfonts}')).toBeLessThan(text.indexOf('\\begin{document}'));
			await waitForNoDiagnostic(source, on('mathbb'), 'the \\mathbb warning gone after the fix');
		});
	});

	test('adds the package an environment needs', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\begin{wrapfigure}{r}{3cm}x\\end{wrapfigure}');
			await waitForDiagnostic(source, on('wrapfigure'));
			const cards = await hoverCard(source, 'wrapfigure', { offset: 3 });
			await cards
				.first()
				.getByRole('button', { name: /usepackage\{wrapfig\}/ })
				.click();
			await expect.poll(() => source.text()).toContain('\\usepackage{wrapfig}');
			await waitForNoDiagnostic(source, on('wrapfigure'), 'the wrapfigure warning gone after the fix');
		});
	});

	test('replaces a misspelled option with the suggestion', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, '\\usepackage[margin=2cm', ',landscpe');
			await waitForDiagnostic(source, on('landscpe'));
			const cards = await hoverCard(source, 'landscpe', { offset: 3 });
			await cards.first().getByRole('button').filter({ hasText: 'landscape' }).click();
			await expect.poll(() => source.text()).toContain('\\usepackage[margin=2cm,landscape]{geometry}');
			await waitForNoDiagnostic(source, (d) => d.message.includes('landscape'), 'the option warning gone after the fix');
		});
	});

	test('moves a package above the one it must precede', async () => {
		const { source } = texpile();
		await withFile(source, 'plain.tex', async () => {
			await insertAfter(source, '\\usepackage{xcolor}', '\n\\usepackage{cleveref}\n\\usepackage{hyperref}');
			await waitForDiagnostic(source, on('{hyperref}'));
			const cards = await hoverCard(source, '{hyperref}', { offset: 2 });
			await cards
				.first()
				.getByRole('button', { name: /Move .*hyperref/ })
				.click();
			await expect
				.poll(async () => {
					const text = await source.text();
					return text.indexOf('\\usepackage{hyperref}') < text.indexOf('\\usepackage{cleveref}');
				})
				.toBe(true);
			await waitForNoDiagnostic(source, (d) => d.message.includes('before cleveref'), 'the order warning gone after the fix');
		});
	});

	test('applies from the gutter card as well', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' $\\mathbb{R}$');
			await waitForDiagnostic(source, on('mathbb'));
			const tooltip = await hoverGutterMarker(source, 'Speed is');
			await tooltip.getByRole('button', { name: /usepackage\{amsfonts\}/ }).click();
			await expect.poll(() => source.text()).toContain('\\usepackage{amsfonts}');
			await waitForNoDiagnostic(source, on('mathbb'), 'the \\mathbb warning gone after the gutter fix');
		});
	});

	test('in a chapter file adds the package to the main file', async () => {
		const { source } = texpile();
		const main = source.path('main.tex');
		await withFile(source, 'main.tex', async () => {
			await withFile(source, 'chapters/results.tex', async () => {
				await insertAfter(source, 'Body text.', ' $\\mathbb{R}$');
				await waitForDiagnostic(source, on('mathbb'));
				const cards = await hoverCard(source, '\\mathbb');
				const fix = cards.first().getByRole('button', { name: /usepackage\{amsfonts\} to main\.tex/ });
				await expect(fix).toBeVisible();
				await fix.click();
				await expect.poll(() => fs.readFileSync(main, 'utf8'), { timeout: 15_000 }).toContain('\\usepackage{amsfonts}');
				await waitForNoDiagnostic(source, on('mathbb'), 'the \\mathbb warning gone in the chapter after the fix');
			});
		});
	});
});

test.describe('the more actions menu', () => {
	async function cardWithMenu(): Promise<Locator> {
		const { source } = texpile();
		await insertAfter(source, 'Speed is', ' \\setcion');
		await waitForDiagnostic(source, on('setcion'));
		return (await hoverCard(source, '\\setcion')).first();
	}

	test('opens on its button and lists Turn off', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			const card = await cardWithMenu();
			const more = moreActionsButton(card);
			await expect(more).toHaveAttribute('aria-expanded', 'false');
			await more.click();
			await expect(more).toHaveAttribute('aria-expanded', 'true');
			await expect(card.getByRole('button', { name: 'Turn off' })).toBeVisible();
		});
	});

	test('closes on Escape', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			const card = await cardWithMenu();
			await moreActionsButton(card).click();
			await expect(card.getByRole('button', { name: 'Turn off' })).toBeVisible();
			await source.press('Escape');
			await expect(card.getByRole('button', { name: 'Turn off' })).toHaveCount(0);
			await expect(moreActionsButton(card)).toHaveAttribute('aria-expanded', 'false');
		});
	});

	test('closes on a click outside it', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			const card = await cardWithMenu();
			await moreActionsButton(card).click();
			await expect(card.getByRole('button', { name: 'Turn off' })).toBeVisible();
			await card.getByText('Define \\setcion').click();
			await expect(card.getByRole('button', { name: 'Turn off' })).toHaveCount(0);
			await page.mouse.click(700, 700);
		});
	});

	test('closes on a click in the editor', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			const card = await cardWithMenu();
			await moreActionsButton(card).click();
			await expect(card.getByRole('button', { name: 'Turn off' })).toBeVisible();
			await page.mouse.click(1000, 600);
			await expect(page.getByRole('button', { name: 'Turn off' })).toHaveCount(0);
		});
	});

	test('opening it leaves the warning in place', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			const card = await cardWithMenu();
			await moreActionsButton(card).click();
			await source.press('Escape');
			expect((await source.diagnostics()).some(on('setcion'))).toBe(true);
			expect(await checkIsOn(source.page, 'undefined-command')).toBe(true);
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

	test('removes the warnings of that check', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' $\\mathbb{R}$ \\setcion');
			await waitForDiagnostic(source, on('setcion'));
			await turnOffFromCard('\\setcion');
			await waitForNoDiagnostic(source, (d) => /mathbb|setcion/.test(d.message), 'the undefined command warnings gone');
			expect(await checkIsOn(page, 'undefined-command')).toBe(false);
			await expect(page.getByText("Stopped checking 'Undefined commands'")).toBeVisible();
		});
	});

	test('leaves the other checks running', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, '\\usepackage{qatools}', '\n\\usepackage{xy}');
			await insertAfter(source, 'Speed is', ' \\setcion');
			await waitForDiagnostic(source, on('setcion'));
			await waitForDiagnostic(source, on('{xy}'));
			await turnOffFromCard('\\setcion');
			await waitForNoDiagnostic(source, on('setcion'), 'the \\setcion warning gone');
			expect((await source.diagnostics()).some(on('{xy}'))).toBe(true);
		});
	});

	test('does not mark a command typed after it', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\setcion');
			await waitForDiagnostic(source, on('setcion'));
			await turnOffFromCard('\\setcion');
			await waitForNoDiagnostic(source, on('setcion'), 'the \\setcion warning gone');
			await insertAfter(source, 'Speed is', ' \\setother $\\mathbb{R}$');
			expect((await settledDiagnostics(source, 3000)).filter((d) => /setother|mathbb/.test(d.text))).toEqual([]);
		});
	});

	test('survives closing and reopening the file', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\setcion');
			await waitForDiagnostic(source, on('setcion'));
			await turnOffFromCard('\\setcion');
			await waitForNoDiagnostic(source, on('setcion'), 'the \\setcion warning gone');
			await openFile(source, 'plain.tex');
			await openFile(source, 'main.tex');
			expect(await source.text()).toContain('\\setcion');
			expect((await settledDiagnostics(source, 3500)).some(on('setcion'))).toBe(false);
		});
	});

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

	test('can be undone from the toast', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\setcion');
			await waitForDiagnostic(source, on('setcion'));
			await turnOffFromCard('\\setcion');
			await waitForNoDiagnostic(source, on('setcion'), 'the \\setcion warning gone');
			await page.getByRole('button', { name: 'Undo' }).click();
			expect(await checkIsOn(page, 'undefined-command')).toBe(true);
			await waitForDiagnostic(source, on('setcion'), 'the \\setcion warning back after Undo');
		});
	});

	test('on an options warning stops only the option warnings', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, '\\documentclass[11pt', ',a4papr');
			await insertAfter(source, 'Speed is', ' \\setcion');
			await waitForDiagnostic(source, on('a4papr'));
			await waitForDiagnostic(source, on('setcion'));
			await turnOffFromCard('a4papr');
			await waitForNoDiagnostic(source, on('a4papr'), 'the option warning gone');
			expect(await checkIsOn(page, 'unknown-option')).toBe(false);
			expect(await checkIsOn(page, 'undefined-command')).toBe(true);
			expect((await source.diagnostics()).some(on('setcion'))).toBe(true);
		});
	});

	test('is offered on the gutter card too', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\setcion');
			await waitForDiagnostic(source, on('setcion'));
			const tooltip = await hoverGutterMarker(source, 'Speed is');
			await moreActionsButton(tooltip).click();
			await tooltip.getByRole('button', { name: 'Turn off' }).click();
			await waitForNoDiagnostic(source, on('setcion'), 'the \\setcion warning gone from the gutter menu');
		});
	});
});

test.describe('the editor around the cards', () => {
	test('the file on disk holds the typed text and nothing of the cards', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			const before = await source.text();
			await insertAfter(source, 'Speed is', ' \\setcion');
			await waitForDiagnostic(source, on('setcion'));
			await hoverCard(source, '\\setcion');
			await expect
				.poll(() => fs.readFileSync(source.path('main.tex'), 'utf8'), { timeout: 10_000 })
				.toBe(before.replace('Speed is', 'Speed is \\setcion'));
		});
	});

	test('the open file stays the one the problem was typed in', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\setcion');
			await waitForDiagnostic(source, on('setcion'));
			await pointMouseAt(source, '\\setcion', 3);
			expect(path.basename((await activeFile(page)) ?? '')).toBe('main.tex');
		});
	});
});

test.describe('folding', () => {
	// folds are remembered per file, so a test starts and ends with none
	async function unfoldEverything(): Promise<void> {
		const { source, page } = texpile();
		await source.evalView('view.focus();');
		await source.press('Control+Alt+BracketRight');
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

	test('an environment folds and leaves its begin and end lines', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			await foldByClick('\\begin{equation}');
			await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(1);
			const shown = await visibleText();
			expect(shown).not.toContain('E = mc^2');
			expect(shown).toContain('\\begin{equation}');
			expect(shown).toContain('\\end{equation}');
			expect(shown).toContain('Speed is');
		});
	});

	test('the preamble folds on the documentclass line', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.evalView('view.dispatch({ selection: { anchor: 0 }, effects: view.constructor.scrollIntoView(0) });');
			await foldByClick('\\documentclass');
			await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(1);
			const shown = await visibleText();
			expect(shown).not.toContain('\\usepackage{geometry}');
			expect(shown).toContain('\\begin{document}');
		});
	});

	test('a section stops at the next section of the same level', async () => {
		const { source, page } = texpile();
		await withFile(source, 'chapters/results.tex', async () => {
			await insertAfter(source, 'Body text.', '\n\\section{After}\nAfter text.');
			await foldByClick('\\section{Results}');
			await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(1);
			const shown = await visibleText();
			expect(shown).not.toContain('Body text.');
			expect(shown).toContain('\\section{After}');
			expect(shown).toContain('After text.');
		});
	});

	test('a subsection folds inside its section only', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is $v^{2}$ and $x_{max}$.', '\n\n\\subsection{Inner}\nInner text.');
			await foldByClick('\\subsection{Inner}');
			const shown = await visibleText();
			expect(shown).not.toContain('Inner text.');
			expect(shown).toContain('Speed is');
			expect(shown).toContain('\\section{Introduction}');
			await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(1);
		});
	});

	test('nested environments fold with their matching end', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(
				source,
				'Speed is $v^{2}$ and $x_{max}$.',
				'\n\\begin{itemize}\n\\item a\n\\begin{itemize}\n\\item inner\n\\end{itemize}\n\\item b\n\\end{itemize}'
			);
			await foldByClick('\\begin{itemize}');
			const shown = await visibleText();
			expect(shown).not.toContain('\\item b');
			expect(shown).not.toContain('inner');
			expect(shown).toContain('\\end{itemize}');
		});
	});

	test('a line that opens nothing has no chevron', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			expect(await foldMarkerFor('Speed is')).toBeNull();
			expect(await foldMarkerFor('E = mc^2')).toBeNull();
		});
	});

	test('the keyboard folds the section at the caret and unfolds it', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('\\section{Intro');
			await source.press('Control+Shift+BracketLeft');
			await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(1);
			expect(await visibleText()).not.toContain('E = mc^2');
			await source.press('Control+Shift+BracketRight');
			await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(0);
			expect(await visibleText()).toContain('E = mc^2');
		});
	});

	test('fold all and unfold all fold every foldable line', async () => {
		const { source, page } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('\\section{Intro');
			await source.press('Control+Alt+BracketLeft');
			await expect.poll(() => page.locator('.cm-foldPlaceholder').count()).toBeGreaterThan(0);
			await source.press('Control+Alt+BracketRight');
			await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(0);
		});
	});

	test('folding changes nothing in the file', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			const before = await source.text();
			await foldByClick('\\section{Introduction}');
			expect(await source.text()).toBe(before);
			await source.press('Control+Alt+BracketRight');
		});
	});

	test('a fold is kept when the file is closed and opened again', async () => {
		const { source, page } = texpile();
		await withFile(source, 'chapters/results.tex', async () => {
			await foldByClick('\\section{Results}');
			await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(1);
			// a fold opens wherever the caret is, so the caret leaves it
			await source.evalView('view.dispatch({ selection: { anchor: 0 } });');
			await page.waitForTimeout(1200);
			await openFile(source, 'plain.tex');
			await openFile(source, 'chapters/results.tex');
			await expect(page.locator('.cm-foldPlaceholder'), 'the section still folded after the file was closed and opened again').toHaveCount(
				1
			);
			expect(await visibleText()).not.toContain('Body text.');
			await source.press('Control+Alt+BracketRight');
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

	async function lineWith(needle: string): Promise<string> {
		const { source } = texpile();
		const text = await source.text();
		return text.split('\n').find((l) => l.includes(needle)) ?? '';
	}

	test('Ctrl+B wraps the selection in \\textbf', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await selectWord('Speed');
			await source.press('Control+b');
			expect(await lineWith('Speed')).toBe('\\textbf{Speed} is $v^{2}$ and $x_{max}$.');
		});
	});

	test('Ctrl+I wraps the selection in \\textit', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await selectWord('Speed');
			await source.press('Control+i');
			expect(await lineWith('Speed')).toBe('\\textit{Speed} is $v^{2}$ and $x_{max}$.');
		});
	});

	test('Ctrl+U wraps the selection in \\underline', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await selectWord('Speed');
			await source.press('Control+u');
			expect(await lineWith('Speed')).toContain('\\underline{Speed}');
		});
	});

	test('Ctrl+` wraps the selection in \\texttt', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await selectWord('Speed');
			await source.press('Control+Backquote');
			expect(await lineWith('Speed')).toContain('\\texttt{Speed}');
		});
	});

	test('a selection chosen with the keyboard is wrapped', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('\\label{sec:intro}\n\n');
			for (let i = 0; i < 5; i++) await source.press('Shift+ArrowRight');
			await source.press('Control+b');
			expect(await lineWith('Speed')).toBe('\\textbf{Speed} is $v^{2}$ and $x_{max}$.');
		});
	});

	test('Ctrl+B again takes the wrapping off', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			const before = await source.text();
			await selectWord('Speed');
			await source.press('Control+b');
			await selectWord('\\textbf{Speed}');
			await source.press('Control+b');
			expect(await source.text()).toBe(before);
		});
	});

	test('Ctrl+B with the caret inside a \\textbf takes it off', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\textbf{bold}');
			await source.caretAfter('\\textbf{bo');
			await source.press('Control+b');
			expect(await lineWith('Speed')).toBe('Speed is bold $v^{2}$ and $x_{max}$.');
		});
	});

	test('Ctrl+B with no selection inserts the command and leaves the caret between the braces', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.press('Control+b');
			await source.type('fast');
			expect(await lineWith('Speed')).toBe('Speed is \\textbf{fast}$v^{2}$ and $x_{max}$.');
		});
	});

	test('Ctrl+B wraps each of several selections', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.evalView(
				`const d = view.state.doc.toString(); const a = d.indexOf('Speed'); const b = d.indexOf('and $x');
				 const S = view.state.selection.constructor;
				 view.dispatch({ selection: S.create([S.range(a, a + 5), S.range(b, b + 3)], 0) }); view.focus();`
			);
			await source.press('Control+b');
			const line = await lineWith('Speed');
			expect(line).toContain('\\textbf{Speed}');
			expect(line).toContain('\\textbf{and}');
		});
	});

	test('one undo takes the wrapping back', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			const before = await source.text();
			await selectWord('Speed');
			await source.press('Control+b');
			await source.press('Control+z');
			expect(await source.text()).toBe(before);
		});
	});

	test('Ctrl+. and Ctrl+Shift+, wrap in superscript and subscript', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await selectWord('Speed');
			await source.press('Control+Period');
			expect(await lineWith('Speed')).toContain('\\textsuperscript{Speed}');
			await selectWord('\\textsuperscript{Speed}');
			await source.press('Control+Period');
			await selectWord('Speed');
			await source.press('Control+Shift+Comma');
			expect(await lineWith('Speed')).toContain('\\textsubscript{Speed}');
		});
	});

	test('Ctrl+M wraps the selection in inline math and Ctrl+Shift+M in display math', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await selectWord('Speed');
			await source.press('Control+m');
			expect(await lineWith('Speed')).toContain('\\(Speed\\)');
			await selectWord('\\(Speed\\)');
			await source.press('Control+Shift+KeyM');
			expect(await lineWith('Speed')).toContain('\\[\\(Speed\\)\\]');
		});
	});

	test('Ctrl+Shift+B wraps the selection in a quote environment', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await selectWord('Speed');
			await source.press('Control+Shift+KeyB');
			const text = await source.text();
			expect(text).toContain('\\begin{quote}\nSpeed\n\\end{quote} is');
		});
	});

	test('Ctrl+Alt+1, 2 and 3 wrap the selection in a heading', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await selectWord('Speed');
			await source.press('Control+Alt+Digit1');
			expect(await lineWith('Speed')).toContain('\\section{Speed}');
			await selectWord('\\section{Speed}');
			await source.press('Control+z');
			await selectWord('Speed');
			await source.press('Control+Alt+Digit2');
			expect(await lineWith('Speed')).toContain('\\subsection{Speed}');
		});
	});

	test('a shortcut leaves the rest of the file as it was', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			const before = await source.text();
			await selectWord('Speed');
			await source.press('Control+b');
			expect(await source.text()).toBe(before.replace('Speed', '\\textbf{Speed}'));
		});
	});

	test('a shortcut press is saved to the file on disk', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await selectWord('Speed');
			await source.press('Control+i');
			await expect.poll(() => fs.readFileSync(source.path('main.tex'), 'utf8'), { timeout: 10_000 }).toContain('\\textit{Speed} is');
		});
	});
});

test('every file of the folder is back as the fixture had it', async () => {
	const { source } = texpile();
	await openFile(source, 'main.tex');
	for (const rel of ['main.tex', 'plain.tex', 'chapters/results.tex', 'refs.bib', 'qatools.sty']) {
		await expect
			.poll(() => fs.readFileSync(source.path(rel), 'utf8'), { message: `${rel} on disk`, timeout: 10_000 })
			.toBe(rel === 'chapters/results.tex' ? RESULTS : fs.readFileSync(path.join(FIXTURE, rel), 'utf8'));
	}
});
