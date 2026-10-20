import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Preferences, answerFolderDialog, answerNextMessageBox, boxAsked } from './driver/preferences';
import { useTexpile, type TexpileSession } from './driver/useTexpile';

const MAIN = '\\documentclass{article}\n\\begin{document}\nHello.\n\\end{document}\n';
const scratch: string[] = [];

/** empty folders of one tex file each, named as given */
function makeFolders(...names: string[]): string[] {
	const base = fs.mkdtempSync(path.join(os.tmpdir(), 'texpile-recent-'));
	scratch.push(base);
	return names.map((name) => {
		const dir = path.join(base, name);
		fs.mkdirSync(dir);
		fs.writeFileSync(path.join(dir, 'main.tex'), MAIN);
		return dir;
	});
}

test.afterAll(() => {
	for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true });
});

const heading = (page: Page) => page.getByText('Start', { exact: true });
// a row's name carries its shortcut after the label
const row = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name}`) });
const editor = (page: Page) => page.locator('.ProseMirror, .cm-editor').first();

/** the history the start screen lists, put in storage and read again by reloading */
async function seedRecents(page: Page, folders: string[]): Promise<void> {
	await page.evaluate((list) => localStorage.setItem('texpile:users', JSON.stringify({ v: 1, recentFolders: list })), folders);
	await page.reload();
	await page.waitForLoadState('domcontentloaded');
	await expect(heading(page)).toBeVisible();
}

const storedRecents = (page: Page) =>
	page.evaluate(() => (JSON.parse(localStorage.getItem('texpile:users') ?? '{}') as { recentFolders?: string[] }).recentFolders ?? []);

test.describe('the start screen', () => {
	const texpile = useTexpile({ startScreen: true });

	test('shows the logo, the Start entries and the footer', async () => {
		const { page } = texpile();
		await expect(heading(page)).toBeVisible();
		await expect(page.getByRole('img', { name: 'Texpile' }).first()).toBeAttached();
		for (const name of ['Open Folder…', 'Join Session', 'New Window', 'Preferences…']) await expect(row(page, name), name).toBeVisible();
		await expect(page.getByRole('button', { name: 'New here? Try the tutorial' })).toBeVisible();
		await expect(page.getByText(/^Texpile v\d+\.\d+\.\d+/)).toBeVisible();
		await expect(page.getByRole('button', { name: /^What's New/ })).toBeVisible();
	});

	test('lists no Recent heading while there is no history', async () => {
		const { page } = texpile();
		await expect(page.getByText('Recent', { exact: true })).toHaveCount(0);
	});

	test('fits the window without a scrollbar', async () => {
		const { page } = texpile();
		const scrolls = await page.evaluate(
			() =>
				[...document.querySelectorAll('*')].filter((el) => {
					const overflow = getComputedStyle(el).overflowY;
					return (overflow === 'auto' || overflow === 'scroll') && el.scrollHeight > el.clientHeight + 1;
				}).length
		);
		expect(scrolls, 'elements that scroll on the start screen').toBe(0);
	});

	test('shows the shortcut beside New Window', async () => {
		const { page } = texpile();
		await expect(row(page, 'New Window')).toContainText('Ctrl+Shift+N');
	});

	test('Ctrl+Comma opens Preferences and Escape closes it', async () => {
		const prefs = new Preferences(texpile().page);
		await prefs.open();
		await expect(prefs.header()).toHaveText('Appearance');
		await prefs.close();
		await expect(heading(texpile().page)).toBeVisible();
	});

	test('the Preferences entry opens it, and the close button shuts it', async () => {
		const { page } = texpile();
		const prefs = new Preferences(page);
		await row(page, 'Preferences…').click();
		await expect(prefs.dialog).toBeVisible();
		await prefs.dialog.getByRole('button', { name: 'Close' }).click();
		await expect(prefs.dialog).toBeHidden();
	});

	test('Preferences from the start screen lists the LaTeX headings without a scrollbar', async () => {
		const prefs = new Preferences(texpile().page);
		await prefs.open();
		await prefs.tab('Editor').click();
		for (const heading of ['Source Editor', 'Visual Editor']) await expect(prefs.tab(heading)).toBeVisible();
		await prefs.goTo('LaTeX');
		expect(await prefs.navOverflows()).toBe(false);
		await expect(prefs.tab('LaTeX')).toHaveAttribute('aria-current', 'page');
	});

	test('with no folder open the package files row counts the global files only', async () => {
		const prefs = new Preferences(texpile().page);
		await prefs.goTo('LaTeX');
		await expect(prefs.row('package-files')).toContainText('0 for every folder');
		await expect(prefs.row('package-files')).not.toContainText('in this folder');
		await prefs.setManage(true);
		await expect(prefs.row('package-files-global')).toBeVisible();
		await expect(prefs.row('package-files-folder')).toHaveCount(0);
	});

	test('with no folder open there are no checks for this folder', async () => {
		const prefs = new Preferences(texpile().page);
		await prefs.goTo('LaTeX');
		await expect(prefs.dialog.getByText('Checks in this folder')).toHaveCount(0);
		for (const label of ['Undefined commands', 'Engine support', 'Package options', 'Package conflicts'])
			await expect(prefs.switchFor(label)).toBeChecked();
	});

	test('a switch changed on the start screen is saved', async () => {
		const session = texpile();
		const prefs = new Preferences(session.page);
		await prefs.goTo('LaTeX');
		await prefs.toggle('Argument hints');
		await expect(prefs.switchFor('Argument hints')).not.toBeChecked();
		await expect
			.poll(
				() =>
					(JSON.parse(fs.readFileSync(path.join(session.userData, 'settings.json'), 'utf8')) as { argumentHints?: boolean }).argumentHints
			)
			.toBe(false);
		await prefs.close();
		await prefs.open();
		await prefs.goTo('LaTeX');
		await expect(prefs.switchFor('Argument hints')).not.toBeChecked();
		await prefs.toggle('Argument hints');
		await prefs.close();
	});

	test('searching Preferences from the start screen finds a setting', async () => {
		const prefs = new Preferences(texpile().page);
		await prefs.open();
		await prefs.search('wrap long');
		await prefs.dialog
			.locator('[data-prefs-group]')
			.getByRole('button', { name: /^Wrap long lines/ })
			.click();
		await expect(prefs.header()).toHaveText('Editor');
		await prefs.close();
	});

	test('the tutorial entry opens its dialog and Escape closes it', async () => {
		const { page } = texpile();
		await page.getByRole('button', { name: 'New here? Try the tutorial' }).click();
		const dialog = page.getByRole('dialog').filter({ hasText: 'Open the Tutorial' });
		await expect(dialog).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
	});

	test("What's New opens the release notes and Escape closes them", async () => {
		const { page } = texpile();
		await page.getByRole('button', { name: /^What's New/ }).click();
		const dialog = page.getByRole('dialog').filter({ hasText: /What's New in Texpile v/ });
		await expect(dialog).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
	});

	test('Join Session opens the join screen and Cancel returns to Start', async () => {
		const { page } = texpile();
		await row(page, 'Join Session').click();
		await expect(page.getByText('Join a Shared Session')).toBeVisible({ timeout: 30_000 });
		await expect(heading(page)).toBeHidden();
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect(heading(page)).toBeVisible();
	});
});

test.describe('Ctrl+O', () => {
	const texpile = useTexpile({ startScreen: true });

	test('a cancelled folder picker leaves the start screen as it was', async () => {
		const { app, page } = texpile();
		await answerFolderDialog(app, null);
		await expect(heading(page)).toBeVisible();
		await page.keyboard.press('Control+o');
		await page.waitForTimeout(800);
		await expect(heading(page)).toBeVisible();
		await expect(page.getByText('Failed to open folder')).toHaveCount(0);
	});

	test('Ctrl+O opens the folder that the picker returns', async () => {
		const { app, page, root } = texpile();
		await answerFolderDialog(app, root);
		await page.keyboard.press('Control+o');
		await expect(editor(page)).toBeVisible({ timeout: 30_000 });
		await expect(page.getByText('main.tex', { exact: true }).first()).toBeVisible();
		await expect(heading(page)).toBeHidden();
	});
});

test.describe('the Open Folder entry', () => {
	const texpile = useTexpile({ startScreen: true });

	test('opens the folder the picker returns and remembers it as recent', async () => {
		const { app, page, root } = texpile();
		await answerFolderDialog(app, root);
		await row(page, 'Open Folder…').click();
		await expect(editor(page)).toBeVisible({ timeout: 30_000 });
		await expect.poll(() => storedRecents(page)).toEqual([root]);
	});
});

test.describe('recent folders', () => {
	const [alpha, beta, gamma] = makeFolders('alpha-paper', 'beta-notes', 'gamma-thesis');
	const texpile = useTexpile({ startScreen: true });

	test('list each folder by name with its path, most recent first', async () => {
		const { page } = texpile();
		await seedRecents(page, [beta, alpha, gamma]);
		await expect(page.getByText('Recent', { exact: true })).toBeVisible();
		const rows = page.locator('[data-recent-row]');
		await expect(rows).toHaveCount(3);
		await expect(rows.nth(0)).toContainText('beta-notes');
		await expect(rows.nth(0)).toContainText(beta);
		await expect(rows.nth(1)).toContainText('alpha-paper');
		await expect(rows.nth(2)).toContainText('gamma-thesis');
	});

	test('a row names the whole path on hover', async () => {
		const { page } = texpile();
		await expect(page.locator('[data-recent-row]').first()).toHaveAttribute('data-tip', beta);
	});

	test('the list is the same after the window is reloaded', async () => {
		const { page } = texpile();
		await page.reload();
		await expect(page.locator('[data-recent-row]')).toHaveCount(3);
	});

	test('a click opens the folder and moves it to the front of the history', async () => {
		const { page } = texpile();
		await page.locator('[data-recent-row]').nth(2).click();
		await expect(editor(page)).toBeVisible({ timeout: 30_000 });
		await expect(page.getByText('main.tex', { exact: true }).first()).toBeVisible();
		await expect.poll(() => storedRecents(page)).toEqual([gamma, beta, alpha]);
	});
});

test.describe('a long history', () => {
	const folders = makeFolders('p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8');
	const texpile = useTexpile({ startScreen: true });

	test('shows the first few rows and Show All with the count', async () => {
		const { page } = texpile();
		await seedRecents(page, folders);
		const shown = await page.locator('[data-recent-row]').count();
		expect(shown).toBeGreaterThan(0);
		expect(shown).toBeLessThan(folders.length);
		await expect(page.getByRole('button', { name: `Show All (${folders.length})` })).toBeVisible();
	});

	test('Show All lists every folder and picking the last one opens it', async () => {
		const { page } = texpile();
		await page.getByRole('button', { name: `Show All (${folders.length})` }).click();
		const dialog = page.getByRole('dialog').filter({ hasText: 'Recent' });
		await expect(dialog.getByRole('button')).toHaveCount(folders.length + 1);
		await dialog.getByRole('button').filter({ hasText: 'p8' }).click();
		await expect(editor(page)).toBeVisible({ timeout: 30_000 });
	});
});

test.describe('a recent folder that is gone', () => {
	const [present] = makeFolders('still-here');
	const missing = path.join(os.tmpdir(), 'texpile-recent-never-existed', 'gone-folder');
	const texpile = useTexpile({ startScreen: true });

	async function clickMissing(session: TexpileSession, answer: string): Promise<void> {
		await answerNextMessageBox(session.app, answer);
		await session.page.locator('[data-recent-row]').filter({ hasText: 'gone-folder' }).click();
		await expect.poll(() => boxAsked(session.app)).not.toBeNull();
	}

	test('Keep says the folder was not found and keeps the entry', async () => {
		const session = texpile();
		await seedRecents(session.page, [missing, present]);
		await clickMissing(session, 'Keep');
		expect((await boxAsked(session.app))?.message).toBe('gone-folder could not be found. It may have been moved, renamed or deleted.');
		await expect(heading(session.page)).toBeVisible();
		await expect(session.page.locator('[data-recent-row]')).toHaveCount(2);
		expect(await storedRecents(session.page)).toEqual([missing, present]);
	});

	test('Remove from Recent drops the entry and leaves the others', async () => {
		const session = texpile();
		await clickMissing(session, 'Remove from Recent');
		await expect(session.page.locator('[data-recent-row]')).toHaveCount(1);
		await expect(session.page.locator('[data-recent-row]').first()).toContainText('still-here');
		await expect.poll(() => storedRecents(session.page)).toEqual([present]);
	});

	test('the folder that is there still opens afterwards', async () => {
		const { page } = texpile();
		await page.locator('[data-recent-row]').first().click();
		await expect(editor(page)).toBeVisible({ timeout: 30_000 });
	});
});

test.describe('opening a second window', () => {
	const texpile = useTexpile({ startScreen: true });

	test('New Window opens another start screen', async () => {
		const { app, page } = texpile();
		const opened = app.waitForEvent('window');
		await row(page, 'New Window').click();
		const second = await opened;
		await second.waitForLoadState('domcontentloaded');
		await expect(second.getByText('Start', { exact: true })).toBeVisible({ timeout: 30_000 });
		await second.close();
	});
});
