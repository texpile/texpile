import { expect, test } from '@playwright/test';
import { Disk } from './driver/disk';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

const table = (columns: string) => `#table(\n  columns: ${columns},\n  [Name], [Value],\n  [alpha], [1],\n)\n`;
const SIZES = `First.\n\n${table('(auto, 3cm)')}\n${table('(3cm, 4cm)')}\n${table('(auto, 1fr)')}\nLast.\n`;
const HELD = `Before.\n\n#align(center)[\n  #table(\n    columns: 2,\n    [Name], [Value],\n    [beta], [2],\n  )\n]\n\nAfter.\n`;

const texpile = useTexpile({ files: { 'sizes.typ': SIZES, 'held.typ': HELD } });

// opening used to turn (auto, 3cm) and (3cm, 4cm) into (1fr, 1fr) in the file, with nothing edited
test('a table keeps the column sizes its file gives when it is opened and the text beside it is edited', async () => {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	const disk = new Disk(root);
	await v.open('sizes.typ');
	const widths = () =>
		page
			.locator('.ProseMirror table')
			.nth(1)
			.locator('col')
			.evaluateAll((cols) => cols.map((c) => (c as HTMLElement).style.width));
	await expect.poll(widths, { message: 'the 3cm and 4cm columns take their widths' }).toEqual(['113px', '151px']);
	// a click on a column border that never moves is no resize
	const cell = (await page.locator('.ProseMirror table').first().locator('td, th').first().boundingBox())!;
	await page.mouse.move(cell.x + cell.width - 1, cell.y + cell.height / 2, { steps: 3 });
	await page.mouse.down();
	await page.mouse.up();
	await v.editor.locator('p', { hasText: 'Last.' }).click();
	await page.keyboard.press('End');
	await page.keyboard.type(' More');
	await disk.expectFile('sizes.typ', (text) => text.includes('Last. More'), 'the typed word is saved');
	expect(disk.read('sizes.typ')).toBe(SIZES.replace('Last.', 'Last. More'));
});

test("a table alone in #align opens the table settings from the handle's gear, where its side and its columns are set", async () => {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	const disk = new Disk(root);
	await v.open('held.typ');
	const block = page.locator('.ProseMirror > .typ-layout').first();
	const drawn = async () => {
		const [outer, inner] = [(await block.boundingBox())!, (await block.locator('table').boundingBox())!];
		return Math.round(inner.x - outer.x - (outer.x + outer.width - inner.x - inner.width));
	};
	expect(Math.abs(await drawn()), 'the table stands in the middle').toBeLessThan(3);
	const box = (await block.boundingBox())!;
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
