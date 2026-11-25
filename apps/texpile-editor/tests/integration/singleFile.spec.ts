import { expect, test } from '@playwright/test';
import { useTexpile } from './driver/useTexpile';
import { inCanvas } from './canvas/canvasPage';

// main.tex on its own, as Finder's Open With or a double-click hands it over
const texpile = useTexpile({ file: 'main.tex' });

// texpile/texpile#103: the workspace kept the lone file's limits, an empty explorer and no bibliography
test('Open in Workspace opens the folder as a project', async () => {
	const { page } = texpile();
	const open = page.getByRole('button', { name: 'Open in Workspace' });
	// the canvas's hidden style mirror holds the document's own data-path elements (an \input's)
	const rows = page.locator('[data-path]');
	await expect(open).toBeVisible();
	await expect(rows).toHaveCount(0);
	await open.click();
	await expect(open).toBeHidden();
	await expect(rows.filter({ hasText: 'refs.bib' })).toBeVisible();
	// the References card reads the folder's .bib
	await expect
		.poll(() =>
			inCanvas(page, ({ probe }) => probe.query('.bibliography-entry').some((entry) => entry.text.includes('Knuth'))).catch(() => false)
		)
		.toBe(true);
});
