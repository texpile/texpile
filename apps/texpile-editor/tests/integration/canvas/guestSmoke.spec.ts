// the guest's way in (11.8, D37): touch on the textarea surface. A tap puts the caret and the focus where the keyboard
// types; a long press selects the word under the finger and draws two handles that a drag moves; a typed letter lands
// at the caret in Firefox, WebKit and Chromium without EditContext
import { expect, test } from '@playwright/test';
import { useTexpile } from '../driver/useTexpile';
import { VisualEditor } from '../driver/visualEditor';
import { inCanvas, probeErrors, settled } from './canvasPage';

const FILES = {
	'guest.tex': [
		'\\documentclass{article}',
		'\\begin{document}',
		'The quick brown fox jumps over the lazy dog.',
		'\\end{document}',
		''
	].join('\n')
};

const texpile = useTexpile({ files: FILES });

function pointOf(visual: VisualEditor, word: string, offset = 1): Promise<{ x: number; y: number }> {
	return inCanvas(
		visual.page,
		({ view, probe }, [text, at]) => {
			const rect = view.coordsAtPos(probe.posOf(text) + at);
			return { x: rect.left, y: (rect.top + rect.bottom) / 2 };
		},
		[word, offset] as [string, number]
	);
}

/** a finger on the paper: the pointer events of a touch, held for `ms` */
async function touch(visual: VisualEditor, at: { x: number; y: number }, ms: number): Promise<void> {
	await visual.page.evaluate(
		async ({ at, ms }) => {
			const target = document.elementFromPoint(at.x, at.y)!;
			const init = { pointerType: 'touch', pointerId: 7, isPrimary: true, bubbles: true, cancelable: true, clientX: at.x, clientY: at.y };
			target.dispatchEvent(new PointerEvent('pointerdown', init));
			await new Promise((done) => setTimeout(done, ms));
			target.dispatchEvent(new PointerEvent('pointerup', init));
		},
		{ at, ms }
	);
}

test('a tap places the caret and the typed letter lands there', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	await visual.open('guest.tex');
	await settled(visual.page);
	const at = await pointOf(visual, 'brown', 5);
	// WebKit has touch emulation; the other engines tap with the mouse
	if (test.info().project.name === 'canvas-webkit') await visual.page.touchscreen.tap(at.x, at.y);
	else await visual.page.mouse.click(at.x, at.y);
	await visual.page.keyboard.type('!');
	await settled(visual.page);
	expect(await visual.text()).toContain('brown! fox');
	expect(
		await visual.page.evaluate(
			() =>
				document.activeElement?.hasAttribute('data-canvas-input') ||
				!!(document.activeElement as HTMLElement | null)?.closest('[data-canvas-root]')
		)
	).toBe(true);
});

test('a long press selects the word and its handles extend the selection', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	await visual.open('guest.tex');
	await settled(visual.page);
	const at = await pointOf(visual, 'quick', 2);
	await touch(visual, at, 650);
	await settled(visual.page);
	expect(await visual.evalView<string>('return view.state.doc.textBetween(view.state.selection.from, view.state.selection.to);')).toBe(
		'quick'
	);
	const handles = await visual.page.locator('[data-canvas-handle]:visible').count();
	expect(handles, 'a handle at each end').toBe(2);
	const end = await visual.page.locator('[data-canvas-handle="end"]').boundingBox();
	const target = await pointOf(visual, 'brown', 5);
	await visual.page.evaluate(
		({ from, to }) => {
			const handle = document.querySelector('[data-canvas-handle="end"]')!;
			const init = { pointerType: 'touch', pointerId: 8, isPrimary: true, bubbles: true, cancelable: true };
			handle.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientX: from.x, clientY: from.y }));
			handle.dispatchEvent(new PointerEvent('pointermove', { ...init, clientX: to.x, clientY: to.y + 18 }));
			handle.dispatchEvent(new PointerEvent('pointerup', { ...init, clientX: to.x, clientY: to.y }));
		},
		{ from: { x: end!.x + 10, y: end!.y + 10 }, to: target }
	);
	await settled(visual.page);
	expect(await visual.evalView<string>('return view.state.doc.textBetween(view.state.selection.from, view.state.selection.to);')).toBe(
		'quick brown'
	);
	expect(await probeErrors(visual.page)).toEqual([]);
});
