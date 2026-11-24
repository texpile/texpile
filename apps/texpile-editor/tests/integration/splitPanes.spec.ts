import { expect, test, type Page } from '@playwright/test';
import { Disk } from './driver/disk';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';
import { inCanvas, settled } from './canvas/canvasPage';
import type { CanvasProbe } from '$lib/editor/canvas';

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

const LONG = `\\documentclass{article}\n\\begin{document}\n${Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1} has enough words to run over several lines of the page, so that a change of width breaks it again.`).join('\n\n')}\n\\end{document}\n`;

const texpile = useTexpile({ files: { 'shared.tex': SHARED, 'list.tex': LIST, 'long.tex': LONG } });

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
	const formula = await inCanvas(page, ({ probe, view }) => {
		let at = -1;
		view.state.doc.descendants((node, pos) => void (at < 0 && node.type.name === 'block_math' && (at = pos)));
		const box = probe.rectOfNode(at)!;
		return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
	});
	await page.mouse.click(formula.x, formula.y);
	await expect
		.poll(() => inCanvas(page, ({ view }) => view.canvas.nested()?.kind ?? null), { message: 'the formula is being edited' })
		.toBe('math');
	await splitSideBySide(page);
	// the pane on the right: the split one
	const beta = await page.evaluate(() => {
		const probe = (window as unknown as { __canvasProbe: CanvasProbe }).__canvasProbe;
		const ends = probe.views().map((view) => view.rectOf(view.posOf('Beta') + 'Beta'.length)!);
		const end = ends.reduce((right, rect) => (rect.left > right.left ? rect : right));
		return { x: end.left, y: end.top + end.height / 2 };
	});
	await page.mouse.click(beta.x - 1, beta.y, { delay: 120 });
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

// the text wrapped the browser's way on every step of the drag, a layout of the whole page each time
test('a divider drag covers the visual editor with its file name and lets it go on the same words', async () => {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	await v.open('long.tex');
	const editor = page.locator('.ProseMirror');
	const thirtieth = await inCanvas(page, ({ probe, view }) => {
		const at = view.state.doc.resolve(probe.posOf('Paragraph 30 ')).before(1);
		view.canvas.revealPos(at, 'center');
		return at;
	});
	await settled(page);
	const firstInView = () =>
		v.evalView<string>(
			`const pane = view.dom.closest('.overflow-auto').getBoundingClientRect(); const hit = view.posAtCoords({ left: pane.left + pane.width / 2, top: pane.top + 4 });
			 return view.state.doc.resolve(hit.pos).parent.textContent.slice(0, 13);`
		);
	const before = await firstInView();
	const width = (await editor.boundingBox())!.width;
	const divider = (await page.locator('.cursor-col-resize').first().boundingBox())!;
	const x = divider.x + divider.width / 2;
	// the block handle, which stayed over the cover
	const paragraph = await inCanvas(
		page,
		({ probe }, at) => {
			const box = probe.rectOfNode(at)!;
			return { x: box.left, y: box.top };
		},
		thirtieth
	);
	const handle = page.locator('.block-handle-btn:visible');
	await expect(async () => {
		await page.mouse.move(5, 5);
		await page.mouse.move(paragraph.x + 40, paragraph.y + 10, { steps: 4 });
		await expect(handle.first()).toBeVisible({ timeout: 1500 });
	}).toPass();
	// beside its block the handle is kept, and the pointer of a drag runs ahead of its divider to there
	await page.evaluate(() => {
		const seen = { overCover: 0, done: false };
		Object.assign(window, { handleSeen: seen });
		function frame(): void {
			if (seen.done) return;
			const shown = [...document.querySelectorAll('.block-handle-btn')].some((button) => getComputedStyle(button).visibility === 'visible');
			if (shown && document.querySelector('[data-resize-cover][data-resizing]')) seen.overCover++;
			requestAnimationFrame(frame);
		}
		requestAnimationFrame(frame);
	});
	await page.mouse.move(x, paragraph.y + 10);
	await page.mouse.down();
	await page.mouse.move(x + 320, paragraph.y + 10, { steps: 16 });
	const cover = page.locator('[data-resize-cover="long.tex"]');
	await expect(cover).toHaveAttribute('data-resizing', '');
	await expect(handle).toHaveCount(0);
	const overCover = await page.evaluate(() => {
		const { handleSeen } = window as unknown as { handleSeen: { overCover: number; done: boolean } };
		handleSeen.done = true;
		return handleSeen.overCover;
	});
	expect(overCover, 'frames with the handle over the cover').toBe(0);
	const held = (await editor.boundingBox())!.width;
	await page.mouse.up();
	await expect(cover).not.toHaveAttribute('data-resizing', '');
	const released = (await editor.boundingBox())!.width;
	expect(
		[width - held < 60, held - released > 60],
		`the page holds its width until the divider is let go: ${width}, ${held}, ${released}`
	).toEqual([true, true]);
	expect(await firstInView()).toBe(before);
});
