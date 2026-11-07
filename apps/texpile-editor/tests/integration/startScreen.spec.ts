import { expect, test, type Page } from '@playwright/test';
import { answerFolderDialog } from './driver/preferences';
import { useTexpile } from './driver/useTexpile';

// a row's name carries its shortcut after the label
const row = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name}`) });
const editor = (page: Page) => page.locator('.ProseMirror, .cm-editor').first();

const storedRecents = (page: Page) =>
	page.evaluate(() => (JSON.parse(localStorage.getItem('texpile:users') ?? '{}') as { recentFolders?: string[] }).recentFolders ?? []);

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
