import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { Preferences, completeWhenShown, diagnosticsMatching, toasts } from './driver/preferences';
import { useTexpile, type TexpileSession } from './driver/useTexpile';

const GLOBAL = '../profile/packages';
const CHECKS_TEX = `\\documentclass{article}
\\usepackage{fontspec}
\\usepackage{cleveref}
\\usepackage[colorlinks, linkcolour=red]{hyperref}
\\begin{document}
Text \\setcion{X} here.

Math $x$ and
\\end{document}
`;
const UNKNOWN_TEX = '\\documentclass{article}\n\\usepackage{zzqaunknownpkg}\n\\begin{document}\nText.\n\\end{document}\n';

// the four live checks, each with a line of checks.tex that triggers it
const CHECKS = [
	{ label: 'Undefined commands', id: 'undefined-command', message: /Define \\setcion or load a package that provides it\./ },
	{ label: 'Engine support', id: 'engine', message: /fontspec needs LuaLaTeX or XeLaTeX\./ },
	{ label: 'Package options', id: 'unknown-option', message: /Did you mean linkcolor\?/ },
	{ label: 'Package conflicts', id: 'package-clash', message: /Load hyperref before cleveref\./ }
];

const TABS = [
	'Appearance',
	'Editor',
	'LaTeX',
	'Typst',
	'Snippets',
	'Spelling',
	'Version Control',
	'Collaboration',
	'Toolchain',
	'Integrations',
	'Startup',
	'AI Assistant'
];

const texpile = useTexpile({
	files: {
		'checks.tex': CHECKS_TEX,
		'unknownpkg.tex': UNKNOWN_TEX,
		// the engine check needs an engine the folder's command names
		'.texpile/config.json': JSON.stringify({ v: 1, latex: { command: 'pdflatex {main}' } }),
		[`${GLOBAL}/gone.json`]: '{ "version": 1, "macros": [{ "name": "gonecmd" }] }',
		[`${GLOBAL}/gtwo.json`]: '{ "version": 1, "macros": [{ "name": "gtwocmd" }] }'
	}
});

function prefsOf(session: TexpileSession): Preferences {
	return new Preferences(session.page);
}

/** Preferences, opened when it is not */
async function opened(session: TexpileSession): Promise<Preferences> {
	const prefs = prefsOf(session);
	await prefs.ensureOpen();
	return prefs;
}

const inViewport = (page: Page, selector: string) =>
	page.evaluate((sel) => {
		const el = document.querySelector(sel);
		if (!el) return false;
		const r = el.getBoundingClientRect();
		return r.top >= 0 && r.bottom <= window.innerHeight && r.height > 0;
	}, selector);

async function settingsOnDisk(session: TexpileSession): Promise<Record<string, unknown>> {
	return JSON.parse(fs.readFileSync(path.join(session.userData, 'settings.json'), 'utf8'));
}

test.describe('opening and closing', () => {
	test('Ctrl+Comma opens Preferences from the workspace, on Appearance', async () => {
		const prefs = prefsOf(texpile());
		await prefs.open();
		await expect(prefs.header()).toHaveText('Appearance');
		await expect(prefs.tab('Appearance')).toHaveAttribute('aria-current', 'page');
	});

	test('Escape closes it', async () => {
		const prefs = await opened(texpile());
		await prefs.close();
	});

	test('the close button closes it', async () => {
		const { page } = texpile();
		const prefs = await opened(texpile());
		await prefs.dialog.getByRole('button', { name: 'Close' }).click();
		await expect(prefs.dialog).toBeHidden();
		await expect(page.locator('.cm-editor, .ProseMirror').first()).toBeVisible();
	});

	test('a click outside the card closes it', async () => {
		const { page } = texpile();
		const prefs = await opened(texpile());
		await page.mouse.click(4, 400);
		await expect(prefs.dialog).toBeHidden();
	});

	test('Ctrl+Comma while it is open leaves one dialog', async () => {
		const { page } = texpile();
		const prefs = await opened(texpile());
		await page.keyboard.press('Control+Comma');
		await expect(page.getByRole('dialog')).toHaveCount(1);
		await prefs.close();
	});

	test('the File menu entry opens it too', async () => {
		const { page } = texpile();
		const prefs = prefsOf(texpile());
		await page
			.getByRole('menuitem', { name: 'File' })
			.or(page.getByRole('button', { name: 'File', exact: true }))
			.first()
			.click();
		await page.getByText('Preferences…', { exact: true }).first().click();
		await expect(prefs.dialog).toBeVisible();
		await prefs.close();
	});
});

test.describe('the sidebar', () => {
	test('a page with headings lists them under it once opened', async () => {
		const prefs = await opened(texpile());
		await prefs.goTo('Appearance');
		await expect(prefs.tab('Source Editor')).toHaveCount(0);
		await prefs.goTo('Editor');
		for (const heading of ['Source Editor', 'Visual Editor']) await expect(prefs.tab(heading)).toBeVisible();
		await prefs.goTo('LaTeX');
		await expect(prefs.tab('Source Editor')).toHaveCount(0);
		await expect(prefs.tab('Completion')).toBeVisible();
	});

	test('a heading in the sidebar scrolls the page to it and is marked while in view', async () => {
		const { page } = texpile();
		const prefs = await opened(texpile());
		await prefs.goTo('LaTeX');
		await prefs.tab('LaTeX checks').click();
		await expect.poll(() => inViewport(page, '[data-prefs-section="checks"]')).toBe(true);
		await expect(prefs.tab('LaTeX checks')).toHaveAttribute('aria-current', 'location');
		await expect(prefs.tab('Completion')).not.toHaveAttribute('aria-current', 'location');
		await expect(prefs.tab('LaTeX')).toHaveAttribute('aria-current', 'page');
	});

	test('the chevron closes the list and stays on the page', async () => {
		const prefs = await opened(texpile());
		await prefs.goTo('Editor');
		await prefs.tab('Editor').locator('svg').click();
		await expect(prefs.tab('Source Editor')).toHaveCount(0);
		await expect(prefs.tab('Editor')).toHaveAttribute('aria-expanded', 'false');
		await expect(prefs.header()).toHaveText('Editor');
	});

	test('each page shows its own settings', async () => {
		const prefs = await opened(texpile());
		await prefs.goTo('Editor');
		await expect(prefs.row('smart-paste')).toBeVisible();
		await prefs.goTo('LaTeX');
		await expect(prefs.row('argument-hints')).toBeVisible();
		await expect(prefs.row('smart-paste')).toHaveCount(0);
		await prefs.goTo('Typst');
		await expect(prefs.row('argument-hints')).toHaveCount(0);
		await expect(prefs.header()).toHaveText('Typst');
	});

	test('every tab opens with its name as the header and no errors', async () => {
		const session = texpile();
		const prefs = await opened(session);
		for (const name of TABS) {
			await prefs.goTo(name);
			await expect(prefs.header(), name).toHaveText(name);
			await expect(prefs.tab(name)).toHaveAttribute('aria-current', 'page');
		}
		expect(session.takeErrors()).toEqual([]);
	});

	test('the sidebar fits without scrolling with the longest list open', async () => {
		const prefs = await opened(texpile());
		await prefs.goTo('LaTeX');
		expect(await prefs.navOverflows()).toBe(false);
		await prefs.close();
	});
});

test.describe('search', () => {
	test('typing in the search box lists the matching settings and the header says Preferences', async () => {
		const prefs = await opened(texpile());
		await prefs.search('argument hints');
		await expect(prefs.header()).toHaveText('Preferences');
		await expect(prefs.dialog.locator('[data-prefs-group]').getByRole('button', { name: /^Argument hints/ })).toBeVisible();
	});

	test('a result opens its page and shows the setting', async () => {
		const { page } = texpile();
		const prefs = await opened(texpile());
		await prefs.dialog
			.locator('[data-prefs-group]')
			.getByRole('button', { name: /^Argument hints/ })
			.click();
		await expect(prefs.header()).toHaveText('LaTeX');
		await expect(prefs.searchBox()).toHaveValue('');
		await expect(prefs.row('argument-hints')).toBeVisible();
		await expect.poll(() => inViewport(page, '[data-pref-row="argument-hints"]')).toBe(true);
		await expect(prefs.tab('LaTeX')).toHaveAttribute('aria-current', 'page');
	});

	test('search reads the note under a setting too', async () => {
		const prefs = await opened(texpile());
		await prefs.search('shows the arguments it takes');
		await expect(prefs.dialog.locator('[data-prefs-group]').getByRole('button', { name: /^Argument hints/ })).toBeVisible();
	});

	test('a setting on another tab is found and revealed', async () => {
		const prefs = await opened(texpile());
		await prefs.search('wrap long');
		await prefs.dialog
			.locator('[data-prefs-group]')
			.getByRole('button', { name: /^Wrap long lines/ })
			.click();
		await expect(prefs.header()).toHaveText('Editor');
		await expect(prefs.row('source-line-wrap')).toBeVisible();
	});

	test('a search with no match says so', async () => {
		const prefs = await opened(texpile());
		await prefs.search('zzzznotasetting');
		await expect(prefs.dialog.getByText('No settings match.')).toBeVisible();
	});

	test('the sidebar shows how many settings match on each tab', async () => {
		const prefs = await opened(texpile());
		await prefs.search('wrap long');
		await expect(prefs.tab('Editor').or(prefs.nav().getByRole('button', { name: /^Editor/ }))).toContainText('1');
	});

	test('Escape clears the search first and a second Escape closes the dialog', async () => {
		const prefs = await opened(texpile());
		await prefs.search('hints');
		await prefs.searchBox().focus();
		await prefs.page.keyboard.press('Escape');
		await expect(prefs.searchBox()).toHaveValue('');
		await expect(prefs.dialog).toBeVisible();
		await prefs.page.keyboard.press('Escape');
		await expect(prefs.dialog).toBeHidden();
	});

	test('the package files row is found and shown with its Manage button', async () => {
		const { page } = texpile();
		const prefs = await opened(texpile());
		await prefs.search('package files');
		const results = prefs.dialog.locator('[data-prefs-group]');
		const row = results.getByRole('button', { name: /^Package files Package files add commands/ });
		await expect(row).toBeVisible();
		await row.click();
		await expect(prefs.header()).toHaveText('LaTeX');
		await expect(prefs.row('package-files')).toBeVisible();
		await expect(prefs.manage()).toBeVisible();
		await expect.poll(() => inViewport(page, '[data-pref-row="package-files"]')).toBe(true);
	});

	test('the global package files result opens the Manage list', async () => {
		const prefs = await opened(texpile());
		await prefs.goTo('LaTeX');
		await prefs.setManage(false);
		await prefs.search('global package files');
		await prefs.dialog
			.locator('[data-prefs-group]')
			.getByRole('button', { name: /^Global package files/ })
			.click();
		await expect(prefs.manage()).toHaveAttribute('aria-expanded', 'true');
		await expect(prefs.dialog.getByText('Global package files', { exact: true })).toBeVisible();
		await expect(prefs.dialog.getByText('Package files in this folder', { exact: true })).toBeVisible();
	});

	test('the folder package files result opens the list at that row', async () => {
		const { page } = texpile();
		const prefs = await opened(texpile());
		await prefs.goTo('LaTeX');
		await prefs.setManage(true);
		await prefs.manage().click();
		await expect(prefs.manage()).toHaveAttribute('aria-expanded', 'false');
		await prefs.search('package files in this folder');
		await prefs.dialog
			.locator('[data-prefs-group]')
			.getByRole('button', { name: /^Package files in this folder/ })
			.click();
		await expect(prefs.manage()).toHaveAttribute('aria-expanded', 'true');
		await expect.poll(() => inViewport(page, '[data-pref-row="package-files-folder"]')).toBe(true);
		await prefs.close();
	});
});

test.describe('IntelliSense switches', () => {
	async function setSwitch(session: TexpileSession, label: string, on: boolean): Promise<void> {
		const prefs = await opened(session);
		await prefs.goTo('LaTeX');
		const input = prefs.switchFor(label);
		if ((await input.isChecked()) !== on) await prefs.toggle(label);
		await expect(input).toBeChecked({ checked: on });
		await prefs.close();
	}

	test('every switch is on in a fresh profile', async () => {
		const prefs = await opened(texpile());
		await prefs.goTo('LaTeX');
		for (const label of ['Completion by mode', 'Argument hints', ...CHECKS.map((c) => c.label)])
			await expect(prefs.switchFor(label), label).toBeChecked();
		await prefs.close();
	});

	test('Completion by mode keeps math commands out of text, and off offers them', async () => {
		const session = texpile();
		await session.source.open('checks.tex');
		const inText = async () => (await completeWhenShown(session.source, 'Text \\setcion{X} here.\n', '\\alph')).map((r) => r.label);
		expect(await inText()).not.toContain('\\alpha');
		await setSwitch(session, 'Completion by mode', false);
		expect(await inText()).toContain('\\alpha');
		await setSwitch(session, 'Completion by mode', true);
		expect(await inText()).not.toContain('\\alpha');
	});

	test('Completion by mode keeps offering math commands in math', async () => {
		const session = texpile();
		await session.source.open('checks.tex');
		const rows = await completeWhenShown(session.source, 'Math $', '\\alph');
		expect(rows.map((r) => r.label)).toContain('\\alpha');
	});

	test('Argument hints shows the arguments while typing, and off stops it', async () => {
		const session = texpile();
		const { source, page } = session;
		await source.open('checks.tex');
		const hintAfterTyping = async () => {
			const before = await source.text();
			await source.caretAfter('Math $x$ and\n');
			await source.type('\\textcolor{');
			await page.waitForTimeout(1200);
			const hint = await source.hint();
			await source.press('Escape');
			await source.restore(before);
			return hint;
		};
		expect(await hintAfterTyping()).toContain('\\textcolor[]{color}{text}');
		await setSwitch(session, 'Argument hints', false);
		expect(await hintAfterTyping()).toBe('');
		await setSwitch(session, 'Argument hints', true);
		expect(await hintAfterTyping()).toContain('\\textcolor[]{color}{text}');
	});

	for (const check of CHECKS) {
		test(`the ${check.label} check warns, and switching it off clears the warning in the open editor`, async () => {
			const session = texpile();
			await session.source.open('checks.tex');
			await expect.poll(() => diagnosticsMatching(session.source, check.message), { timeout: 15_000 }).toHaveLength(1);
			await setSwitch(session, check.label, false);
			await expect.poll(() => diagnosticsMatching(session.source, check.message), { timeout: 15_000 }).toHaveLength(0);
			await setSwitch(session, check.label, true);
			await expect.poll(() => diagnosticsMatching(session.source, check.message), { timeout: 15_000 }).toHaveLength(1);
		});
	}

	test('switching one check off leaves the others running', async () => {
		const session = texpile();
		await session.source.open('checks.tex');
		await setSwitch(session, 'Undefined commands', false);
		await expect.poll(() => diagnosticsMatching(session.source, CHECKS[0].message), { timeout: 15_000 }).toHaveLength(0);
		for (const check of CHECKS.slice(1))
			await expect.poll(() => diagnosticsMatching(session.source, check.message), { timeout: 15_000 }).toHaveLength(1);
		await setSwitch(session, 'Undefined commands', true);
	});

	test('a switch takes the keyboard: focus it and press Space', async () => {
		const { page } = texpile();
		const prefs = await opened(texpile());
		await prefs.goTo('LaTeX');
		const input = prefs.switchFor('Argument hints');
		await input.focus();
		await page.keyboard.press('Space');
		await expect(input).not.toBeChecked();
		await page.keyboard.press('Space');
		await expect(input).toBeChecked();
		await prefs.close();
	});

	test('switches turned off stay off after closing and reopening Preferences, and are saved to the profile', async () => {
		const session = texpile();
		const prefs = await opened(session);
		const all = ['Completion by mode', 'Argument hints', ...CHECKS.map((c) => c.label)];
		await prefs.open();
		await prefs.goTo('LaTeX');
		for (const label of all) await prefs.toggle(label);
		for (const label of all) await expect(prefs.switchFor(label), label).not.toBeChecked();
		await prefs.close();
		await prefs.open();
		await prefs.goTo('LaTeX');
		for (const label of all) await expect(prefs.switchFor(label), `${label} after reopening`).not.toBeChecked();
		await expect
			.poll(
				async () =>
					(await settingsOnDisk(session)) as { completionByMode?: boolean; argumentHints?: boolean; latexChecks?: Record<string, boolean> }
			)
			.toMatchObject({
				completionByMode: false,
				argumentHints: false,
				latexChecks: { 'undefined-command': false, engine: false, 'unknown-option': false, 'package-clash': false }
			});
		await prefs.close();
	});

	test('with every switch off the open editor shows no warnings and offers math commands in text', async () => {
		const session = texpile();
		await session.source.open('checks.tex');
		await session.page.waitForTimeout(2500);
		expect(await session.source.diagnostics()).toEqual([]);
		const rows = await completeWhenShown(session.source, 'Text \\setcion{X} here.\n', '\\alph');
		expect(rows.map((r) => r.label)).toContain('\\alpha');
	});

	test('switching them back on restores the warnings and the saved profile', async () => {
		const session = texpile();
		const prefs = await opened(session);
		await prefs.goTo('LaTeX');
		for (const label of ['Completion by mode', 'Argument hints', ...CHECKS.map((c) => c.label)]) await prefs.toggle(label);
		await prefs.close();
		for (const check of CHECKS)
			await expect.poll(() => diagnosticsMatching(session.source, check.message), { timeout: 15_000 }).toHaveLength(1);
		await expect.poll(async () => ((await settingsOnDisk(session)) as { argumentHints?: boolean }).argumentHints !== false).toBe(true);
	});
});

test.describe('package files row', () => {
	test('shows how many package files this folder and every folder have', async () => {
		const session = texpile();
		const prefs = await opened(session);
		await prefs.goTo('LaTeX');
		await expect(prefs.row('package-files')).toContainText('1 in this folder · 2 for every folder');
	});

	test('Manage lists the global and the folder files', async () => {
		const prefs = await opened(texpile());
		await prefs.goTo('LaTeX');
		await prefs.setManage(false);
		await prefs.manage().click();
		await expect(prefs.manage()).toHaveAttribute('aria-expanded', 'true');
		const global = prefs.row('package-files-global');
		const folder = prefs.row('package-files-folder');
		await expect(global.getByText('gone', { exact: true })).toBeVisible();
		await expect(global.getByText('gtwo', { exact: true })).toBeVisible();
		await expect(folder.getByText('inhousemacros', { exact: true })).toBeVisible();
		await expect(global.getByRole('button', { name: 'Open the package file for gone' })).toBeVisible();
		await expect(folder.getByRole('button', { name: 'Delete the package file for inhousemacros' })).toBeVisible();
	});

	test('Manage hides the lists again', async () => {
		const prefs = await opened(texpile());
		await prefs.goTo('LaTeX');
		await prefs.setManage(true);
		await prefs.manage().click();
		await expect(prefs.manage()).toHaveAttribute('aria-expanded', 'false');
		await expect(prefs.row('package-files-global')).toHaveCount(0);
	});

	test('the count follows a global file added while Preferences is open', async () => {
		const session = texpile();
		const prefs = await opened(session);
		await prefs.goTo('LaTeX');
		fs.writeFileSync(path.join(session.userData, 'packages', 'gthree.json'), '{ "version": 1, "macros": [{ "name": "gthreecmd" }] }');
		await expect(prefs.row('package-files')).toContainText('1 in this folder · 3 for every folder', { timeout: 15_000 });
	});

	test('Open on a row opens the file in the editor and closes Preferences', async () => {
		const { page } = texpile();
		const prefs = await opened(texpile());
		await prefs.goTo('LaTeX');
		await prefs.setManage(true);
		await prefs.dialog.getByRole('button', { name: 'Open the package file for inhousemacros' }).click();
		await expect(prefs.dialog).toBeHidden();
		await expect(page.getByText('Commands for the inhousemacros package in this folder')).toBeVisible();
	});

	test('a document that loads a package without data fills the New package file choice', async () => {
		const session = texpile();
		await session.source.open('unknownpkg.tex');
		const prefs = await opened(session);
		await prefs.goTo('LaTeX');
		const select = prefs.dialog.getByRole('combobox', { name: 'New package file' });
		await expect(select.locator('option')).toHaveText(['Choose a package', 'zzqaunknownpkg']);
	});

	test('choosing a package TeX does not have says so', async () => {
		const { page } = texpile();
		const prefs = await opened(texpile());
		await prefs.goTo('LaTeX');
		await prefs.setManage(true);
		await prefs.dialog.getByRole('combobox', { name: 'New package file' }).selectOption('zzqaunknownpkg');
		await expect(toasts(page).filter({ hasText: 'zzqaunknownpkg.sty is not in the TeX installation' }).first()).toBeVisible();
		await prefs.close();
	});
});

test.describe('the title bar', () => {
	test('the divider before the window buttons shows only when a button strip takes the end of the bar', async () => {
		const { page } = texpile();
		await page.keyboard.press('Escape');
		const state = await page.evaluate(() => {
			const overlay = (navigator as unknown as { windowControlsOverlay?: { visible: boolean; getTitlebarAreaRect(): DOMRect } })
				.windowControlsOverlay;
			const free = overlay?.visible ? overlay.getTitlebarAreaRect() : null;
			const dividers = [...document.querySelectorAll('div.h-4.w-px')].map((d) => d.getBoundingClientRect());
			return {
				strip: !!free && free.x + free.width < window.innerWidth,
				right: free ? free.x + free.width : innerWidth,
				dividers: dividers.map((r) => r.right)
			};
		});
		expect(state.dividers.length > 0, 'a divider in the bar').toBe(state.strip);
		for (const right of state.dividers) expect(right, 'the divider sits left of the window buttons').toBeLessThanOrEqual(state.right);
	});
});

test.describe('a previous session with switches off', () => {
	const off = useTexpile({
		files: { 'checks.tex': CHECKS_TEX },
		settings: { argumentHints: false, completionByMode: false, latexChecks: { 'undefined-command': false } }
	});

	test('Preferences shows those switches off and the rest on', async () => {
		const prefs = await opened(off());
		await prefs.goTo('LaTeX');
		for (const label of ['Completion by mode', 'Argument hints', 'Undefined commands'])
			await expect(prefs.switchFor(label), label).not.toBeChecked();
		for (const label of ['Engine support', 'Package options', 'Package conflicts'])
			await expect(prefs.switchFor(label), label).toBeChecked();
		await prefs.close();
	});

	test('the editor follows them from the start', async () => {
		const { source, page } = off();
		await source.open('checks.tex');
		await page.waitForTimeout(2500);
		expect(await diagnosticsMatching(source, CHECKS[0].message)).toEqual([]);
		const rows = await completeWhenShown(source, 'Text \\setcion{X} here.\n', '\\alph');
		expect(rows.map((r) => r.label)).toContain('\\alpha');
	});
});
