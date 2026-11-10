import { expect, test } from '@playwright/test';
import { Disk } from './driver/disk';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

const doc = (body: string) => `\\documentclass{article}\n\\begin{document}\n\n${body}\n\n\\end{document}\n`;

const texpile = useTexpile({
	files: {
		'bold-toolbar.tex': doc('Hello world and more'),
		'undo-type.tex': doc('Hello'),
		'count-live.tex': doc('Hello'),
		'sync.tex': doc('Hello')
	}
});

function visual(): VisualEditor {
	const { page, root } = texpile();
	return new VisualEditor(page, root);
}

function disk(): Disk {
	return new Disk(texpile().root);
}

test('main.tex switches Visual, Source, Visual with no errors and no change on disk', async () => {
	const v = visual();
	const rel = 'main.tex';
	const original = disk().readBytes(rel);
	await v.open(rel);
	await v.showSource();
	expect(await v.page.locator('.cm-content').first().innerText()).toContain(original.toString('utf8').trim().split('\n')[0]);
	await v.showVisual();
	await v.showSource();
	await v.showVisual();
	await expect(v.editor).toBeVisible();
	await v.page.waitForTimeout(1500);
	expect(disk().readBytes(rel).equals(original), `${rel} changed on disk by switching modes`).toBe(true);
});

test.describe('typing in the visual editor', () => {
	test('typing inside main.tex changes only that sentence on disk', async () => {
		const v = visual();
		const original = disk().read('main.tex');
		await v.open('main.tex');
		await v.caretAtEndOf('Speed is');
		await v.press('Home');
		for (let i = 0; i < 'Speed is '.length; i++) await v.press('ArrowRight');
		await v.type('very fast and ');
		await disk().expectFile(
			'main.tex',
			(t) => t === original.replace('Speed is ', 'Speed is very fast and '),
			'main.tex after typing in a sentence'
		);
		// put it back
		for (let i = 0; i < 'very fast and '.length; i++) await v.press('Backspace');
		await disk().expectFile('main.tex', (t) => t === original, 'main.tex after deleting what was typed');
	});
});

test.describe('typing and the file format', () => {
	test('text typed in visual shows in the source view and text typed in source shows in visual', async () => {
		const v = visual();
		await v.open('sync.tex');
		await v.caretAtEndOf('Hello');
		await v.type(' there');
		await v.showSource();
		await expect.poll(() => v.page.locator('.cm-content').first().innerText()).toContain('Hello there');
		await v.type('!!');
		await v.showVisual();
		await expect.poll(() => v.text()).toBe('Hello there!!');
		await disk().expectFile('sync.tex', (t) => t.includes('Hello there!!'), 'the typed text on disk');
	});
});

test.describe('bold and italic', () => {
	test('the Bold toolbar button wraps the selection in \\textbf and a second click unwraps it', async () => {
		const v = visual();
		await v.open('bold-toolbar.tex');
		await v.select('world');
		await v.toolbarButton('Bold').click();
		await disk().expectFile('bold-toolbar.tex', (t) => t.includes('Hello \\textbf{world} and more'), 'bold from the toolbar');
		await v.select('world');
		await v.toolbarButton('Bold').click();
		await disk().expectFile('bold-toolbar.tex', (t) => t.includes('Hello world and more') && !t.includes('textbf'), 'bold toggled off');
	});
});

test.describe('undo and redo in the visual editor', () => {
	test('Ctrl+Z takes typed text back out and Ctrl+Shift+Z puts it in again', async () => {
		const v = visual();
		await v.open('undo-type.tex');
		await v.caretAtEndOf('Hello');
		await v.type(' there');
		await disk().expectFile('undo-type.tex', (t) => t.includes('Hello there'), 'typed text saved');
		await v.press('ControlOrMeta+z');
		await disk().expectFile('undo-type.tex', (t) => t === doc('Hello'), 'undo reached the disk');
		expect(await v.text()).toBe('Hello');
		await v.press('ControlOrMeta+Shift+KeyZ');
		await disk().expectFile('undo-type.tex', (t) => t.includes('Hello there'), 'redo reached the disk');
		expect(await v.text()).toBe('Hello there');
	});
});

test.describe('word count', () => {
	test('the count follows typing and deleting', async () => {
		const v = visual();
		await v.open('count-live.tex');
		await expect(v.wordCount()).toHaveText('1 word');
		await v.caretAtEndOf('Hello');
		await v.type(' big');
		await expect(v.wordCount()).toHaveText('2 words');
		await v.type(' wide world');
		await expect(v.wordCount()).toHaveText('4 words');
		for (let i = 0; i < ' wide world'.length; i++) await v.press('Backspace');
		await expect(v.wordCount()).toHaveText('2 words');
		for (let i = 0; i < ' big'.length; i++) await v.press('Backspace');
		await expect(v.wordCount()).toHaveText('1 word');
	});
});
