import { expect, test } from '@playwright/test';
import { Disk } from './driver/disk';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';
import { inCanvas, settled } from './canvas/canvasPage';

const table = (columns: string) => `#table(\n  columns: ${columns},\n  [Name], [Value],\n  [alpha], [1],\n)\n`;
const SIZES = `First.\n\n${table('(auto, 3cm)')}\n${table('(3cm, 4cm)')}\n${table('(auto, 1fr)')}\nLast.\n`;
const HELD = `Before.\n\n#align(center)[\n  #table(\n    columns: 2,\n    [Name], [Value],\n    [beta], [2],\n  )\n]\n\nAfter.\n`;

const EVEN = table('(1fr, 1fr)');

const texpile = useTexpile({ files: { 'sizes.typ': SIZES, 'held.typ': HELD, 'even.typ': EVEN } });

/** the rect of each cell in the document, in order */
function cells(page: Parameters<typeof inCanvas>[0]) {
	return inCanvas(page, ({ probe }) => probe.query('td, th').map((cell) => cell.rect));
}

// opening used to turn (auto, 3cm) and (3cm, 4cm) into (1fr, 1fr) in the file, with nothing edited
test('a table keeps the column sizes its file gives when it is opened and the text beside it is edited', async () => {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	const disk = new Disk(root);
	await v.open('sizes.typ');
	await settled(page);
	const widths = async () => (await cells(page)).slice(4, 6).map((cell) => Math.round(cell.width));
	await expect.poll(widths, { message: 'the 3cm and 4cm columns take their widths' }).toEqual([113, 151]);
	// a click on a column border that never moves is no resize
	const cell = (await cells(page))[0];
	await page.mouse.move(cell.left + cell.width - 1, cell.top + cell.height / 2, { steps: 3 });
	await page.mouse.down();
	await page.mouse.up();
	await v.caretAtEndOf('Last.');
	await v.type(' More');
	await disk.expectFile('sizes.typ', (text) => text.includes('Last. More'), 'the typed word is saved');
	expect(disk.read('sizes.typ')).toBe(SIZES.replace('Last.', 'Last. More'));
});

test("a table alone in #align opens the table settings from the handle's gear, where its side and its columns are set", async () => {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	const disk = new Disk(root);
	await v.open('held.typ');
	await settled(page);
	const [box, inner] = await inCanvas(page, ({ probe }) => [probe.query('.typ-layout')[0].rect, probe.query('table')[0].rect]);
	const off = Math.round(inner.left - box.left - (box.right - inner.right));
	expect(Math.abs(off), 'the table stands in the middle').toBeLessThan(3);
	await v.openBlockSettings(box.x + box.width / 2, box.y + box.height / 2);
	const settings = page.locator('.bare-table-settings');
	const side = settings.getByRole('radiogroup', { name: 'Alignment' });
	await expect(side.getByRole('radio', { name: 'Center' })).toHaveAttribute('aria-checked', 'true');
	await side.getByRole('radio', { name: 'Right' }).click();
	await expect.poll(() => disk.read('held.typ')).toContain('#align(right)[');
	// the second column, which took the block's side until now
	await settings.getByRole('radiogroup').nth(3).getByRole('radio', { name: 'Left' }).click();
	await expect.poll(() => disk.read('held.typ')).toContain('align: (auto, left),');
});

test('dragging a column border trades width with the next column in quarter-fr steps, and undo takes it back', async () => {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	const disk = new Disk(root);
	await v.open('even.typ');
	await settled(page);
	const [first, second] = await cells(page);
	const tableWidth = second.right - first.left;
	await page.mouse.move(first.right - 2, first.top + first.height / 2, { steps: 3 });
	await expect(page.locator('.column-resize-handle')).toBeVisible();
	await page.mouse.down();
	await page.mouse.move(first.right - 2 + tableWidth / 8, first.top + first.height / 2, { steps: 6 });
	await page.mouse.up();
	await disk.expectFile('even.typ', (text) => text.includes('columns: (1.25fr, 0.75fr),'), 'the traded widths on disk');
	await v.caretAtEndOf('alpha');
	await page.keyboard.press('ControlOrMeta+z');
	await disk.expectFile('even.typ', (text) => text === EVEN, 'the file after undo');
});
