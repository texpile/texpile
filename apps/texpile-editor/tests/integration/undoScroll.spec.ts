import { expect, test } from '@playwright/test';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

const LONG = Array.from({ length: 120 }, (_, i) => `Paragraph ${i} with some words in it to fill a line.`).join('\n\n');
const doc = `\\documentclass{article}\n\\begin{document}\n\n${LONG}\n\n\\end{document}\n`;

const texpile = useTexpile({ files: { 'undo-scroll.tex': doc } });

function visual(): VisualEditor {
	const { page, root } = texpile();
	return new VisualEditor(page, root);
}

async function caretInView(v: VisualEditor): Promise<boolean> {
	return v.evalView<boolean>(`const r = view.coordsAtPos(view.state.selection.head); return r.top >= 0 && r.bottom <= window.innerHeight;`);
}

async function scrollToBottom(v: VisualEditor): Promise<void> {
	await v.evalView(
		`let el = view.dom;
		 while (el && el.scrollHeight <= el.clientHeight + 1) el = el.parentElement;
		 (el ?? document.scrollingElement).scrollTop = 1e9;`
	);
	await expect.poll(async () => !(await caretInView(v))).toBe(true);
}

test('undo and redo scroll the change into view', async () => {
	const v = visual();
	await v.open('undo-scroll.tex');
	await v.caretAfter('Paragraph 0 with');
	await v.type(' EDITED');
	await expect.poll(() => v.text()).toContain('EDITED');
	await scrollToBottom(v);
	await v.press('Control+z');
	await expect.poll(() => v.text()).not.toContain('EDITED');
	await expect.poll(() => caretInView(v), { message: 'undo shows the change' }).toBe(true);
	await scrollToBottom(v);
	await v.press('Control+y');
	await expect.poll(() => v.text()).toContain('EDITED');
	await expect.poll(() => caretInView(v), { message: 'redo shows the change' }).toBe(true);
});
