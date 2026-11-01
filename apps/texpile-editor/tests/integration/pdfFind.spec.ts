import { expect, test } from '@playwright/test';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

/** a one page PDF holding `text`, all ASCII */
function onePagePdf(text: string): string {
	const page = `BT /F1 18 Tf 40 100 Td (${text}) Tj ET`;
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
		`<< /Length ${page.length} >>\nstream\n${page}\nendstream`,
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
	];
	let pdf = '%PDF-1.4\n';
	const offsets = objects.map((body, i) => {
		const at = pdf.length;
		pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
		return at;
	});
	const xref = pdf.length;
	pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	pdf += offsets.map((at) => `${String(at).padStart(10, '0')} 00000 n \n`).join('');
	return pdf + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}

const texpile = useTexpile({
	files: { '.texpile/config.json': JSON.stringify({ v: 1, main: 'main.tex' }), 'main.pdf': onePagePdf('Hello PDF') }
});

test('Ctrl+F after a click in the PDF preview finds in the PDF, not in the source beside it', async () => {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	await v.open('main.tex');
	await v.showSource();
	// the preview shows what a compile hands it
	await page.evaluate(async (path) => {
		const files = await import(/* @vite-ignore */ '/src/lib/workspace/fileSystem.ts' as string);
		const store = await import(/* @vite-ignore */ '/src/lib/stores/pdfStore.ts' as string);
		store.pdfStore.current = files.fileUrl(path);
	}, v.path('main.pdf'));
	const pages = page.locator('.pdf-viewer-container').first();
	// the pane may be open and still drawing, so wait for the pages or the button that opens it
	const showPdf = page.getByRole('button', { name: 'Show PDF' });
	await expect(pages.or(showPdf).first()).toBeVisible();
	if (await showPdf.isVisible()) await showPdf.click();
	await expect(pages).toBeVisible();
	await expect(page.locator('.pdf-loading')).toHaveCount(0);
	await page.locator('.cm-content').first().click();
	await pages.click();
	await page.keyboard.press('Control+f');
	await expect(page.locator('.pdf-find')).toBeVisible();
	await expect(page.locator('.cm-editor .cm-panel')).toHaveCount(0);
});

test('a PDF tab floats its bar over the pages, with the first page and the find box clear of it', async () => {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	await page.evaluate(
		async (file) => (await import(/* @vite-ignore */ '/src/lib/workspace/workspaceStore.ts' as string)).openFile(file),
		v.path('main.pdf')
	);
	const viewer = page.locator('.pdf-viewer-container:has(.preview-toolbar.in-editor)');
	const bar = viewer.locator('.preview-toolbar');
	await expect(bar).toBeVisible();
	const barBottom = async () => {
		const box = (await bar.boundingBox())!;
		return box.y + box.height;
	};
	const sheet = viewer.locator('.page').first();
	await expect(sheet).toBeVisible();
	await expect.poll(async () => (await sheet.boundingBox())!.y).toBeGreaterThanOrEqual(await barBottom());
	await bar.getByRole('button', { name: 'Find', exact: true }).click();
	const box = viewer.locator('.find-widget');
	await expect(box).toBeVisible();
	// this window leaves no room beside the bar, so the box hangs below it, as in the editors
	await expect.poll(async () => (await box.boundingBox())!.y).toBeGreaterThanOrEqual(await barBottom());
	await page.keyboard.press('Escape');
});

test('a menu opened from the "..." menu hangs under its row in a transparent window, and a pick in it lands', async () => {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	await page.evaluate(() => document.documentElement.classList.add('window-glass'));
	await page.evaluate(
		async (file) => (await import(/* @vite-ignore */ '/src/lib/workspace/workspaceStore.ts' as string)).openFile(file),
		v.path('main.pdf')
	);
	await page.getByRole('button', { name: 'More actions' }).last().click();
	const row = page.locator('.preview-overflow-menu').getByRole('button', { name: 'Color vision' });
	await row.click();
	const menu = page.getByRole('menu', { name: 'Color vision' });
	const under = (await row.boundingBox())!;
	expect((await menu.boundingBox())!.y).toBeCloseTo(under.y + under.height + 4, 0);
	await menu.getByRole('menuitemradio', { name: 'Tritanopia' }).click();
	await expect(row).toHaveAttribute('aria-pressed', 'true');
	await row.click();
	await menu.getByRole('menuitemradio').first().click();
	await expect(row).toHaveAttribute('aria-pressed', 'false');
});
