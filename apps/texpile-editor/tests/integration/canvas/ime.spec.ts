// typed text through each input surface (11.1 to 11.3): EditContext in Chromium and the
// textarea in every engine without it: projects canvas-firefox and canvas-webkit, and canvas-textarea, which is Chromium
// with EditContext removed
import { expect, test } from '@playwright/test';
import { useTexpile } from '../driver/useTexpile';
import { VisualEditor } from '../driver/visualEditor';
import { inCanvas, probeErrors, settled } from './canvasPage';

const FILES = {
	'ime.tex': [
		'\\documentclass{article}',
		'\\begin{document}',
		'First line of words here.',
		'',
		'Second paragraph, $x^2$ and more.',
		'\\end{document}',
		''
	].join('\n')
};

type Surface = 'editContext' | 'textarea';

/** a click right after `word` puts the caret there and the surface holds the focus */
async function clickAfter(visual: VisualEditor, word: string): Promise<void> {
	const at = await inCanvas(
		visual.page,
		({ view, probe }, text) => {
			const pos = probe.posOf(text) + text.length;
			const rect = view.coordsAtPos(pos);
			return { x: rect.left + 1, y: (rect.top + rect.bottom) / 2 };
		},
		word
	);
	// the test before may have clicked the same spot: two clicks within 500 ms are a double click, which selects the word
	await visual.page.waitForTimeout(500);
	await visual.page.mouse.click(at.x, at.y);
	await settled(visual.page);
}

function surfaceOf(visual: VisualEditor): Promise<Surface> {
	return visual.page.evaluate(() => (document.querySelector('[data-canvas-input]') ? 'textarea' : 'editContext'));
}

function inputTests(window: () => ReturnType<ReturnType<typeof useTexpile>>): void {
	test(`typed text, Enter, Backspace and one undo`, async () => {
		const visual = new VisualEditor(window().page, window().root);
		await visual.open('ime.tex');
		await settled(visual.page);
		const wanted: Surface = test.info().project.name.match(/textarea|firefox|webkit/) ? 'textarea' : 'editContext';
		expect(await surfaceOf(visual)).toBe(wanted);
		await clickAfter(visual, 'First line');
		await visual.page.keyboard.type('abc');
		await settled(visual.page);
		expect(await visual.text()).toContain('First lineabc of words');
		await visual.page.keyboard.press('Backspace');
		await visual.page.keyboard.press('Enter');
		await settled(visual.page);
		expect(await visual.text()).toContain('First lineab');
		expect(await visual.text()).toMatch(/First lineab\s+of words/);
		await visual.page.keyboard.press('ControlOrMeta+z');
		await settled(visual.page);
		expect(await visual.text()).not.toMatch(/First lineab\s+of words/);
		expect(await probeErrors(visual.page)).toEqual([]);
	});

	test('an OS replacement of a word lands in the document through the textarea', async () => {
		const visual = new VisualEditor(window().page, window().root);
		await visual.open('ime.tex');
		await settled(visual.page);
		test.skip((await surfaceOf(visual)) !== 'textarea', 'EditContext reports a replacement as a text update');
		await clickAfter(visual, 'First line');
		await visual.page.evaluate(() => {
			const area = document.querySelector('[data-canvas-input]') as HTMLTextAreaElement;
			area.value = area.value.replace('words', 'wordz');
			area.dispatchEvent(new InputEvent('input', { inputType: 'insertReplacementText', bubbles: true }));
		});
		await settled(visual.page);
		expect(await visual.text()).toContain('First line of wordz here.');
		expect(await probeErrors(visual.page)).toEqual([]);
	});
}

inputTests(useTexpile({ files: FILES }));
