// A1: a keyed caret move keeps three caret lines between the caret and the foot of the pane, in LaTeX, Typst and Markdown
import { expect, test } from '@playwright/test';
import { useTexpile } from '../driver/useTexpile';
import { VisualEditor } from '../driver/visualEditor';
import { settled } from './canvasPage';

const SENTENCE = 'Paragraph %N% with some words in it to fill a line of the pane.';
const body = (join: string) => Array.from({ length: 70 }, (_, i) => SENTENCE.replace('%N%', String(i))).join(join);
const DOCUMENTS = {
	'margin.tex': `\\documentclass{article}\n\\begin{document}\n\n${body('\n\n')}\n\n\\end{document}\n`,
	'margin.typ': `${body('\n\n')}\n`,
	'margin.md': `${body('\n\n')}\n`
};

const texpile = useTexpile({ files: DOCUMENTS });

type Caret = { top: number; bottom: number; height: number; foot: number; scrollTop: number; docY: number };

async function caretNow(v: VisualEditor): Promise<Caret> {
	return v.evalView<Caret>(
		`const rect = view.coordsAtPos(view.state.selection.head);
		const scroller = view.canvas.scroller;
		const foot = scroller.getBoundingClientRect().bottom - 5;
		return { top: rect.top, bottom: rect.bottom, height: rect.bottom - rect.top, foot, scrollTop: scroller.scrollTop, docY: rect.top + scroller.scrollTop };`
	);
}

/** the caret's gap to the foot of the band is the margin, within the few pixels a long document's heights settle by after the jump */
function expectMargin(caret: Caret, what: string): void {
	const gap = caret.foot - caret.bottom;
	expect(gap, `${what}: three caret lines above the foot`).toBeGreaterThanOrEqual(Math.min(3 * caret.height, 0.2 * 700) - 6);
}

for (const rel of Object.keys(DOCUMENTS)) {
	test(`${rel}: the caret stays three lines above the foot after Ctrl+End, Enter and ten typed lines`, async () => {
		const { page, root } = texpile();
		const v = new VisualEditor(page, root);
		await v.open(rel);
		await settled(page);
		await v.evalView('view.focus(); return true;');
		await page.keyboard.press('Control+End');
		await settled(page);
		expectMargin(await caretNow(v), 'after Ctrl+End');
		await page.keyboard.press('Enter');
		await settled(page);
		expectMargin(await caretNow(v), 'after Enter');
		for (let line = 0; line < 10; line++) {
			await page.keyboard.type(`typed line ${line}`);
			await page.keyboard.press('Enter');
			await settled(page);
			expectMargin(await caretNow(v), `after typed line ${line}`);
		}
	});

	test(`${rel}: ArrowDown past the margin scrolls as far as the caret moved`, async () => {
		const { page, root } = texpile();
		const v = new VisualEditor(page, root);
		await v.open(rel);
		await settled(page);
		await v.evalView('view.focus(); return true;');
		await page.keyboard.press('Control+Home');
		await settled(page);
		let previous = await caretNow(v);
		let scrolled = 0;
		for (let press = 0; press < 40; press++) {
			await page.keyboard.press('ArrowDown');
			await settled(page);
			const now = await caretNow(v);
			if (previous.scrollTop > 0 && now.scrollTop > previous.scrollTop) {
				scrolled++;
				expect(now.scrollTop - previous.scrollTop, 'one line of scroll for the line the caret moved').toBeCloseTo(
					now.docY - previous.docY,
					0
				);
				expectMargin(now, `press ${press}`);
			}
			previous = now;
		}
		expect(scrolled, 'presses that scrolled').toBeGreaterThan(10);
	});
}
