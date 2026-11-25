// typed text and an input method composing through each input surface (11.1 to 11.3): EditContext in Chromium and the
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

const COMPOSITIONS = [
	{ language: 'Japanese', steps: ['に', 'にほ', 'にほん'], commit: '日本' },
	{ language: 'Chinese', steps: ['n', 'ni', 'ni h', 'ni hao'], commit: '你好' }
];

async function caretClientRect(visual: VisualEditor): Promise<{ left: number; top: number; bottom: number }> {
	return inCanvas(visual.page, ({ view }) => {
		const rect = view.coordsAtPos(view.state.selection.head);
		return { left: rect.left, top: rect.top, bottom: rect.bottom };
	});
}

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

/** compose through the engine's own channel: CDP's IME in Chromium, the composition events on the textarea elsewhere */
async function compose(visual: VisualEditor, texts: string[], commit: string): Promise<() => Promise<void>> {
	const { page } = visual;
	if ((await surfaceOf(visual)) === 'editContext') {
		const cdp = await page.context().newCDPSession(page);
		for (const text of texts) await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
		await settled(page);
		return async () => {
			await cdp.send('Input.insertText', { text: commit });
			await cdp.detach();
		};
	}
	await page.evaluate((list) => {
		const area = document.querySelector('[data-canvas-input]') as HTMLTextAreaElement;
		area.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
		for (const data of list) area.dispatchEvent(new CompositionEvent('compositionupdate', { data }));
	}, texts);
	await settled(page);
	return () =>
		page.evaluate((data) => {
			const area = document.querySelector('[data-canvas-input]') as HTMLTextAreaElement;
			area.dispatchEvent(new CompositionEvent('compositionend', { data }));
		}, commit);
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

	for (const { language, steps, commit: committed } of COMPOSITIONS)
		test(`an input method composes ${language} and the surface sits at the caret`, async () => {
			const visual = new VisualEditor(window().page, window().root);
			await visual.open('ime.tex');
			await settled(visual.page);
			await clickAfter(visual, 'and more');
			const before = await visual.evalView<string>('return JSON.stringify(view.state.doc.toJSON());');
			const caret = await caretClientRect(visual);
			const commit = await compose(visual, steps, committed);
			expect(await visual.evalView<boolean>('return view.composing;')).toBe(true);
			const text = await visual.text();
			expect(text).toContain(`and more${steps.at(-1)}`);
			// candidate windows open at the caret: the textarea is placed there, EditContext reports the character bounds
			const placed = await visual.page.evaluate(() => {
				const area = document.querySelector('[data-canvas-input]');
				if (area) {
					const rect = area.getBoundingClientRect();
					return { left: rect.left, top: rect.top };
				}
				const context = (document.querySelector('[data-canvas-root]') as HTMLElement & { editContext: { characterBounds(): DOMRect[] } })
					.editContext;
				const [first] = context.characterBounds();
				return first ? { left: first.left, top: first.top } : null;
			});
			expect(placed, 'where candidates open').not.toBeNull();
			expect(Math.abs(placed!.top - caret.top)).toBeLessThan(caret.bottom - caret.top + 2);
			// EditContext reports the preedit's first character, the textarea follows the caret at its end
			const now = await caretClientRect(visual);
			expect(Math.min(Math.abs(placed!.left - caret.left), Math.abs(placed!.left - now.left))).toBeLessThan(6);
			await commit();
			await settled(visual.page);
			expect(await visual.text()).toContain(`and more${committed}`);
			expect(await visual.evalView<boolean>('return view.composing;')).toBe(false);
			await visual.page.keyboard.press('ControlOrMeta+z');
			await settled(visual.page);
			expect(await visual.evalView<string>('return JSON.stringify(view.state.doc.toJSON());'), 'one undo takes the composition back').toBe(
				before
			);
			expect(await probeErrors(visual.page)).toEqual([]);
		});
}

inputTests(useTexpile({ files: FILES }));
