import { expect, test, type Locator, type Page } from '@playwright/test';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

const PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj
trailer<</Root 1 0 R>>
%%EOF
`;

const texpile = useTexpile({ files: { 'note.md': '# Note\n\nWords.\n', 'note.typ': '= Note\n\nWords.\n', 'doc.pdf': PDF } });

// a notice row can sit above the bar, so its top is the pane's business
const shape = async (bar: Locator) => {
	const { x, width, height } = (await bar.boundingBox())!;
	return { x, width, height };
};

async function open(page: Page, file: string): Promise<void> {
	await page.evaluate(async (f) => (await import(/* @vite-ignore */ '/src/lib/workspace/workspaceStore.ts' as string)).openFile(f), file);
}

test('every editor and viewer has one floating toolbar, in the same box', async () => {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	const format = page.locator('[data-format-bar]');
	await v.open('main.tex');
	await expect(format).toBeVisible();
	const baseline = await shape(format);
	expect(baseline.height).toBeLessThan(35);

	for (const file of ['main.tex', 'note.typ', 'note.md']) {
		await open(page, v.path(file));
		await v.showSource();
		await expect.poll(async () => shape(format), { message: `${file} source` }).toEqual(baseline);
		await v.showVisual();
		await expect.poll(async () => shape(format), { message: `${file} visual` }).toEqual(baseline);
	}
	// a window with room shows every control, with nothing folded behind the expand button
	await page.setViewportSize({ width: 1900, height: 860 });
	await open(page, v.path('main.tex'));
	await expect(format.getByRole('button', { name: 'Insert link' })).toBeVisible();
	await page.setViewportSize({ width: 1280, height: 860 });

	await open(page, v.path('doc.pdf'));
	await expect.poll(async () => shape(page.locator('.preview-toolbar.in-editor')), { message: 'pdf' }).toEqual(baseline);
});
