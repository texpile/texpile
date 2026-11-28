import { expect, test } from '@playwright/test';
import { Disk } from './driver/disk';
import { useTexpile } from './driver/useTexpile';

const SHARED = 'One file in two panes.\n';

const texpile = useTexpile({ files: { 'shared.tex': SHARED } });

test('the same file in two panes edits as one and saves once', async () => {
	const { source, page, root } = texpile();
	await source.open('shared.tex');
	await page.getByRole('button', { name: 'Layout' }).click();
	await page.getByRole('menuitemradio', { name: 'Two side by side' }).click();
	const panes = page.locator('.cm-editor .cm-content');
	await expect(panes).toHaveCount(2);
	await source.caretAfter('One file');
	await source.type(' typed');
	await expect
		.poll(async () => (await panes.allInnerTexts()).map((t) => t.trim()), { message: 'both panes' })
		.toEqual(['One file typed in two panes.', 'One file typed in two panes.']);
	await new Disk(root).expectFile('shared.tex', (t) => t === 'One file typed in two panes.\n', 'the edit on disk');
	await source.restore(SHARED);
	await page.getByRole('button', { name: 'Layout' }).click();
	await page.getByRole('menuitemradio', { name: 'One editor' }).click();
});
