import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Disk } from './driver/disk';
import { answerNextMessageBox } from './driver/preferences';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

// a plain RGB picture of this size, colored so a crop changes what is left
function png(w: number, h: number): Buffer {
	const crcTable = Array.from({ length: 256 }, (_, n) => {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		return c >>> 0;
	});
	const crc = (b: Buffer) => {
		let c = 0xffffffff;
		for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
		return (c ^ 0xffffffff) >>> 0;
	};
	const chunk = (type: string, data: Buffer) => {
		const head = Buffer.alloc(4);
		head.writeUInt32BE(data.length);
		const body = Buffer.concat([Buffer.from(type), data]);
		const tail = Buffer.alloc(4);
		tail.writeUInt32BE(crc(body));
		return Buffer.concat([head, body, tail]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0);
	ihdr.writeUInt32BE(h, 4);
	ihdr.set([8, 2, 0, 0, 0], 8);
	const rows = Buffer.alloc((w * 3 + 1) * h);
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rows.set([(x * 255) / w, (y * 255) / h, 128], y * (w * 3 + 1) + 1 + x * 3);
	const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

function pngSize(bytes: Buffer): [number, number] {
	return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

const SHOT = png(300, 200);
const LATEX =
	'\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\n\n\\begin{figure}\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{shot.png}\n  \\caption{Shot.}\n\\end{figure}\n\n\\end{document}\n';
const TYPST = '= Shot\n\n#figure(image("shot.png", width: 80%), caption: [Shot.])\n';

const texpile = useTexpile({ files: { 'crop.tex': LATEX, 'crop.typ': TYPST } });

function placeImage(root: string): void {
	if (!fs.existsSync(path.join(root, 'shot.png'))) fs.writeFileSync(path.join(root, 'shot.png'), SHOT);
}

async function cropFromTheLeft(page: Page): Promise<void> {
	const image = page.locator('.imagePluginRoot > img').first();
	await image.scrollIntoViewIfNeeded();
	await image.hover();
	await page.locator('.imagePluginRoot button[aria-label="Crop"]').first().click();
	const box = page.locator('.paper-cropper .crop-box');
	await expect(box).toBeVisible();
	const handle = await page.locator('.paper-cropper .crop-handle-w').boundingBox();
	const frame = await box.boundingBox();
	if (!handle || !frame) throw new Error('the crop box is not on screen');
	await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
	await page.mouse.down();
	await page.mouse.move(handle.x + frame.width * 0.25, handle.y + handle.height / 2, { steps: 8 });
	await page.mouse.up();
}

test('a crop in the LaTeX paper is written as trim and clip, and undo takes it back', async () => {
	const { page, root } = texpile();
	placeImage(root);
	const visual = new VisualEditor(page, root);
	const disk = new Disk(root);
	await visual.open('crop.tex');
	await cropFromTheLeft(page);
	await page.getByRole('button', { name: 'Done' }).click();
	const cropped = await disk.expectFile('crop.tex', (t) => /trim=\d/.test(t), 'the crop on disk');
	expect(cropped).toContain('\\includegraphics[width=0.8\\linewidth, trim=');
	expect(cropped).toMatch(/trim=[\d.]+ 0 0 0, clip\]\{shot\.png\}/);
	await visual.editor.click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('Control+z');
	await disk.expectFile('crop.tex', (t) => t === LATEX, 'the file after undo');
});

test('a crop in the Typst paper wraps the image and defines texpile-crop once', async () => {
	const { page, root } = texpile();
	placeImage(root);
	const visual = new VisualEditor(page, root);
	const disk = new Disk(root);
	await visual.open('crop.typ');
	await cropFromTheLeft(page);
	await page.keyboard.press('Enter');
	const cropped = await disk.expectFile('crop.typ', (t) => t.includes('texpile-crop(left:'), 'the crop on disk');
	expect(cropped.match(/#let texpile-crop\(/g)).toHaveLength(1);
	expect(cropped).toMatch(/#figure\(texpile-crop\(left: [\d.]+%, image\("shot\.png", width: 80%\)\), caption: \[Shot\.\]\)/);
	await cropFromTheLeft(page);
	await page.keyboard.press('Escape');
	await expect(page.locator('.paper-cropper')).toHaveCount(0);
	expect(disk.read('crop.typ')).toBe(cropped);
	await visual.editor.click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('Control+z');
	await disk.expectFile('crop.typ', (t) => t === TYPST, 'the file after undo');
});

test('the image tab lists its uses, writes each edit, undoes, and restores the original', async () => {
	const { app, page, root } = texpile();
	placeImage(root);
	const disk = new Disk(root);
	await page.evaluate(
		async (file) => (await import(/* @vite-ignore */ '/src/lib/workspace/workspaceStore.ts' as string)).openFile(file),
		path.join(root, 'shot.png')
	);
	await expect(page.locator('[role=application] img')).toBeVisible();
	const uses = page.getByRole('button', { name: 'Where this image is used' });
	await expect(uses).toHaveText('2');
	await uses.click();
	await expect(page.getByRole('menuitem')).toHaveText([/crop\.(tex|typ) - line \d+/, /crop\.(tex|typ) - line \d+/]);
	await uses.click();
	await expect(page.getByRole('menuitem')).toHaveCount(0);

	await page.getByRole('button', { name: 'Edit image' }).click();
	await page.getByRole('button', { name: 'Turn right' }).click();
	await expect.poll(() => pngSize(disk.readBytes('shot.png')), { message: 'the turned file' }).toEqual([200, 300]);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(() => pngSize(disk.readBytes('shot.png')), { message: 'the file after undo' }).toEqual([300, 200]);
	await page.getByRole('spinbutton', { name: 'Height in pixels' }).fill('100');
	await page.keyboard.press('Enter');
	await expect.poll(() => pngSize(disk.readBytes('shot.png')), { message: 'the shrunk file' }).toEqual([150, 100]);

	await answerNextMessageBox(app, 'Restore');
	await page.getByRole('button', { name: 'Restore original' }).click();
	await expect.poll(() => disk.readBytes('shot.png').equals(SHOT), { message: 'the original back' }).toBe(true);
	await page.getByRole('button', { name: 'Edit image' }).click();
});
