import { expect, test } from '@playwright/test';
import { useTexpile } from './driver/useTexpile';

// main.tex on its own, as Finder's Open With or a double-click hands it over
const texpile = useTexpile({ file: 'main.tex' });

// texpile/texpile#103: the workspace kept the lone file's limits, an empty explorer and no bibliography
test('Open in Workspace opens the folder as a project', async () => {
	const { page } = texpile();
	const open = page.getByRole('button', { name: 'Open in Workspace' });
	await expect(open).toBeVisible();
	await expect(page.locator('[data-path]')).toHaveCount(0);
	await open.click();
	await expect(open).toBeHidden();
	await expect(page.locator('[data-path]').filter({ hasText: 'refs.bib' })).toBeVisible();
	// read from the folder's .bib
	await expect(page.getByText('Donald E. Knuth')).toBeVisible();
});
