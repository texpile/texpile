import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Disk } from './driver/disk';
import { answerNextMessageBox } from './driver/preferences';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';
import { inCanvas, settled } from './canvas/canvasPage';

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
const GRID =
	'#figure(\n  grid(\n    columns: 2,\n    gutter: 1em,\n    image("wide.png"),\n    image("wide.png"),\n  ),\n  caption: [Two shots],\n)\n';
const texpile = useTexpile({ files: { 'crop.tex': LATEX, 'grid.typ': GRID } });

function placeImage(root: string): void {
	if (!fs.existsSync(path.join(root, 'shot.png'))) fs.writeFileSync(path.join(root, 'shot.png'), SHOT);
	if (!fs.existsSync(path.join(root, 'wide.png'))) fs.writeFileSync(path.join(root, 'wide.png'), png(900, 600));
}

async function cropFromTheLeft(page: Page): Promise<void> {
	const picture = await inCanvas(page, ({ probe, view }) => {
		const found = probe.query('.imagePluginImg')[0];
		view.canvas.revealPos(found.pos!, 'center');
		return found.pos!;
	});
	await settled(page);
	const shown = await inCanvas(page, ({ probe }, pos) => probe.query('.imagePluginImg').find((el) => el.pos === pos)!.rect, picture);
	await page.mouse.click(shown.left + shown.width / 2, shown.top + shown.height / 2);
	await page.locator('.block-bar').getByRole('button', { name: 'Crop' }).click();
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
	await page.keyboard.press('ControlOrMeta+z');
	await disk.expectFile('crop.tex', (t) => t === LATEX, 'the file after undo');
});

test("dragging a figure's handle writes its width in tenths of the text width, and undo takes it back", async () => {
	const { page, root } = texpile();
	placeImage(root);
	const visual = new VisualEditor(page, root);
	const disk = new Disk(root);
	await visual.open('crop.tex');
	const shown = await inCanvas(page, ({ probe, view }) => {
		const found = probe.query('.imagePluginImg')[0];
		view.canvas.revealPos(found.pos!, 'center');
		return found.pos!;
	}).then(async (pos) => {
		await settled(page);
		return inCanvas(page, ({ probe }, at) => probe.query('.imagePluginImg').find((el) => el.pos === at)!.rect, pos);
	});
	await page.mouse.move(shown.left + shown.width / 2, shown.top + shown.height / 2);
	const handle = await page.locator('.image-resize-handle.right').boundingBox();
	if (!handle) throw new Error('the resize handle is not on screen');
	await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
	await page.mouse.down();
	await page.mouse.move(handle.x - shown.width * 0.15, handle.y + handle.height / 2, { steps: 8 });
	await page.mouse.up();
	await disk.expectFile('crop.tex', (t) => /includegraphics\[width=0\.5\\textwidth\]/.test(t), 'the narrower width on disk');
	await visual.editor.click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('ControlOrMeta+z');
	await disk.expectFile('crop.tex', (t) => t === LATEX, 'the file after undo');
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
	await expect(uses).toHaveText('1');
	await uses.click();
	await expect(page.getByRole('menuitem')).toHaveText([/crop\.tex - line \d+/]);
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
	await page.getByRole('button', { name: 'More actions' }).click();
	await page.getByRole('button', { name: 'Restore original' }).click();
	await expect.poll(() => disk.readBytes('shot.png').equals(SHOT), { message: 'the original back' }).toBe(true);
	await page.getByRole('button', { name: 'Edit image' }).click();
});

// a picture wider than its cell was squeezed to the cell's width at its full height, and the figure had no gear
test("pictures side by side in a Typst figure keep their shape, and the handle's gear opens the grid's settings", async () => {
	const { page, root } = texpile();
	placeImage(root);
	const v = new VisualEditor(page, root);
	await v.open('grid.typ');
	const boxes = () =>
		inCanvas(page, ({ probe }) => ({
			picture: probe.query('.imagePluginImg')[0]?.rect ?? null,
			cell: probe.query('.typ-grid-cell')[0]?.rect ?? null
		}));
	await expect
		.poll(async () => {
			const { picture } = await boxes();
			return picture && picture.height > 10 ? Math.round((picture.width / picture.height) * 10) : 0;
		})
		.toBe(15);
	const { picture, cell } = await boxes();
	expect(picture!.width).toBeLessThanOrEqual(cell!.width + 1);
	const shown = { x: picture!.left, y: picture!.top, width: picture!.width, height: picture!.height };
	await v.openBlockSettings(shown.x + shown.width / 2, shown.y + shown.height / 2);
	await expect(page.getByText('Columns', { exact: true })).toBeVisible();
});
