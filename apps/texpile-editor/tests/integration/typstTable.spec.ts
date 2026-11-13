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
	await v.editor.locator('p', { hasText: 'Last.' }).click();
	await page.keyboard.press('End');
	await page.keyboard.type(' More');
	await disk.expectFile('sizes.typ', (text) => text.includes('Last. More'), 'the typed word is saved');
	expect(disk.read('sizes.typ')).toBe(SIZES.replace('Last.', 'Last. More'));
});
