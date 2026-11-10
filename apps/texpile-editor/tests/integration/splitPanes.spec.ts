import { expect, test, type Page } from '@playwright/test';
import { Disk } from './driver/disk';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

const SHARED = 'One file in two panes.\n';
const LIST = String.raw`\documentclass{article}
\begin{document}
\begin{enumerate}
  \item Alpha
  \item Beta
\end{enumerate}

\begin{equation}\label{eq:main}
  a^2 + b^2 = c^2
\end{equation}

Last paragraph.
\end{document}
`;

const texpile = useTexpile({ files: { 'shared.tex': SHARED, 'list.tex': LIST } });

async function splitSideBySide(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Layout' }).click();
	await page.getByRole('menuitemradio', { name: 'Two side by side' }).click();
	await expect(page.locator('.ProseMirror')).toHaveCount(2);
}

test('a visual split opens with the caret it was split from, and a click there types where it landed', async () => {
	const { page, root } = texpile();
	const visual = new VisualEditor(page, root);
	const disk = new Disk(root);
	await visual.open('list.tex');
	await page.locator('.ProseMirror .block-math-container').first().click();
	await expect(page.locator('math-field').first()).toBeFocused();
	await splitSideBySide(page);
	const beta = page.locator('.ProseMirror').nth(1).getByText('Beta', { exact: true });
	const box = (await beta.boundingBox())!;
	await page.mouse.click(box.x + box.width - 1, box.y + box.height / 2, { delay: 120 });
	await visual.type('X');
	// past the moment the editor left behind follows the edit
	await page.waitForTimeout(1000);
	await visual.type('YZ');
	await disk.expectFile('list.tex', (t) => t.includes('\\item BetaXYZ\n') && t.includes('a^2 + b^2 = c^2'), 'typed where the click landed');

	await page.getByRole('button', { name: 'Layout' }).click();
	await page.getByRole('menuitemradio', { name: 'One editor' }).click();
	await visual.caretAfter('Last para');
	await splitSideBySide(page);
	await page.keyboard.press('ControlOrMeta+2');
	await visual.type('W');
	await disk.expectFile('list.tex', (t) => t.includes('Last paraWgraph.'), 'typed at the caret the split carried');

	disk.write('list.tex', LIST);
	await page.getByRole('button', { name: 'Layout' }).click();
	await page.getByRole('menuitemradio', { name: 'One editor' }).click();
});

test('the same file in two panes edits as one and saves once', async () => {
	const { source, page, root } = texpile();
	await source.open('shared.tex');
	await page.getByRole('button', { name: 'Layout' }).click();
	await page.getByRole('menuitemradio', { name: 'Two side by side' }).click();
	const panes = page.locator('.cm-editor .cm-content');
	await expect(panes).toHaveCount(2);
	await source.caretAfter('One file');
	await source.type(' typed');
	await expect
		.poll(async () => (await panes.allInnerTexts()).map((t) => t.trim()), { message: 'both panes' })
		.toEqual(['One file typed in two panes.', 'One file typed in two panes.']);
	await new Disk(root).expectFile('shared.tex', (t) => t === 'One file typed in two panes.\n', 'the edit on disk');
	await source.restore(SHARED);
	await page.getByRole('button', { name: 'Layout' }).click();
	await page.getByRole('menuitemradio', { name: 'One editor' }).click();
});
