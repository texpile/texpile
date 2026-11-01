import { expect, test } from '@playwright/test';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

const texpile = useTexpile();

test('a narrow window moves menus into overflow and a wide one brings them back, without a ResizeObserver loop', async () => {
	const { page, root } = texpile();
	await new VisualEditor(page, root).open('main.tex');
	const help = page
		.getByRole('menuitem', { name: 'Help' })
		.or(page.getByRole('button', { name: 'Help', exact: true }))
		.first();
	await expect(help).toBeVisible();
	await page.setViewportSize({ width: 760, height: 860 });
	await expect(help).toBeHidden();
	await page.setViewportSize({ width: 1900, height: 860 });
	await expect(help).toBeVisible();
	await page.waitForTimeout(500);
});
