import { expect, test, type Page } from '@playwright/test';
import { useTexpile } from './driver/useTexpile';

test.skip(process.platform === 'darwin', 'the menu bar is native on macOS');

const texpile = useTexpile();

const STORE = `(await import('/src/lib/stores/editorStore.ts'))`;

function spellcheckOn(page: Page): Promise<boolean> {
	return page.evaluate(
		async (STORE) => (await new Function(`return (async () => ${STORE})()`)()).editorConfigStore.current?.spellcheck ?? false,
		STORE
	);
}

test('spelling is under Edit, the bottom panel and the zoom under Layout, with no View or Spelling menu', async () => {
	const { page, source } = texpile();
	await source.open('main.tex');
	await expect(page.getByRole('button', { name: 'View', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Spelling', exact: true })).toHaveCount(0);

	const before = await spellcheckOn(page);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Spelling' }).click();
	await page.getByRole('menuitem', { name: 'Check Spelling & Grammar' }).click();
	await expect.poll(() => spellcheckOn(page)).toBe(!before);

	const layout = page.getByRole('button', { name: 'Layout' });
	const bottomPanel = page.getByRole('menuitemcheckbox', { name: 'Bottom Panel' });
	await layout.click();
	const shown = (await bottomPanel.getAttribute('aria-checked')) === 'true';
	await bottomPanel.click();
	await layout.click();
	await expect(bottomPanel).toHaveAttribute('aria-checked', String(!shown));
	await bottomPanel.click();
	await layout.click();
	await page.getByRole('button', { name: 'Zoom In' }).click();
	await page.getByRole('button', { name: 'Reset Zoom 110%' }).click();
	await expect(page.getByRole('button', { name: 'Reset Zoom 100%' })).toBeVisible();
	await page.keyboard.press('Escape');

	await page.evaluate(
		async ({ STORE, on }) => {
			const store = (await new Function(`return (async () => ${STORE})()`)()).editorConfigStore;
			store.current = { ...store.current, spellcheck: on };
		},
		{ STORE, on: before }
	);
});
