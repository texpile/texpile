// Louis, 2026-11-18: "when first loading the canvas editor: i see each row of text shake up and down a little bit until
// they settle". The comment cards show with a file's first rows and stay, at 100 and 150 percent
import { expect, test, type Page } from '@playwright/test';
import { useTexpile } from '../../driver/useTexpile';
import { VisualEditor } from '../../driver/visualEditor';
import { inCanvas, probeErrors, settled } from '../canvasPage';
import { quietFrames, recordShownRows, stopShownRows, type ShownRows } from './shownRows';

// Dutch: the fixture opens in German and English, so these patterns load with this file
const words = [
	'De arbeidsongeschiktheidsverzekering van de ziektekostenverzekeringsmaatschappij',
	'besprak de kindercarnavalsoptochtvoorbereidingswerkzaamheden en de vervoersbewijzen, terwijl',
	'wetenschappers de snelheidsbeperkingen en de verantwoordelijkheidsverdeling onderzochten.'
];
const paragraph = (i: number) =>
	`${words.slice(0, 1 + (i % 3)).join(' ')} Alinea ${i} met $a_${i}^2 + b^2$. ${'Er volgen nog meer zinnen. '.repeat(i % 7)}`;
const body = Array.from({ length: 240 }, (_, i) => (i % 25 === 0 ? `\\section{Hoofdstuk ${i / 25}}\n\n` : '') + paragraph(i)).join('\n\n');
const preamble =
	'\\documentclass{article}\n\\usepackage[dutch]{babel}\n\\usepackage{amssymb}\n' +
	'\\title{Over $\\mathbb{Z}_p$-uitbreidingen en $\\sum_{n\\ge 1} n^{-s}$}\n\\author{Iemand}\n';
const long = `${preamble}\\begin{document}\n\n\\maketitle\n\n${body}\n\n\\end{document}\n`;
/** an open thread on the paragraph's opening words, one near the top and one where the caret is put mid file */
function threadOn(paragraph: number): string {
	const quote = `Alinea ${paragraph} met`;
	const start = long.indexOf(quote);
	const anchor = {
		quote,
		prefix: long.slice(start - 32, start),
		suffix: long.slice(start + quote.length, start + quote.length + 32),
		start
	};
	const id = `00000000-0000-4000-8000-${String(paragraph).padStart(12, '0')}`;
	return JSON.stringify({
		v: 1,
		t: 'open',
		id,
		file: 'long.tex',
		by: 'Lezer',
		body: 'Klopt dit?',
		anchor: { ...anchor, end: start + quote.length },
		at: '2026-11-18T12:00:00.000Z'
	});
}
const files = { 'long.tex': long };
const filesWithThreads = { ...files, '.texpile/comments.jsonl': [0, 120].map(threadOn).join('\n') + '\n' };

function setTheme(page: Page, mode: 'light' | 'dark'): Promise<void> {
	return page.evaluate(async (mode) => {
		const theme = await import(/* @vite-ignore */ '/src/lib/theme.ts' as string);
		theme.setTheme(mode);
	}, mode);
}

/** client rects come in 1/64 px layout units, so a still row can read a hundredth off */
const STILL_PX = 0.05;

/** every state the pane showed of the file is the first one */
function expectStill(states: ShownRows[], file: string, what: string): ShownRows {
	const shown = states.filter((state) => state.path.endsWith(file));
	expect(shown.length, `${what}: the file was shown`).toBeGreaterThan(0);
	const [first] = shown;
	for (const state of shown.slice(1)) {
		const moved =
			state.rows.length === first.rows.length
				? state.rows.filter(([text, top], i) => text !== first.rows[i][0] || Math.abs(top - first.rows[i][1]) > STILL_PX)
				: state.rows;
		expect(moved, `${what}: a row moved or broke again after it first showed`).toEqual([]);
	}
	return first;
}

/** scrolls to the middle of the file and clicks there; the number of the paragraph the caret went into */
async function clickMidFile(page: Page): Promise<string> {
	const caret = await inCanvas(page, ({ view, probe }) => {
		const { scroller } = view.canvas;
		scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) / 2;
		return probe.settle().then(() => {
			const box = scroller.getBoundingClientRect();
			return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
		});
	});
	await page.mouse.click(caret.x, caret.y);
	await settled(page);
	return caretParagraph(page);
}

function caretParagraph(page: Page): Promise<string> {
	return inCanvas(page, ({ view }) => view.state.selection.$head.parent.textContent.match(/Alinea (\d+)/)?.[1] ?? '');
}

test.describe('a reload', () => {
	const texpile = useTexpile({ files });

	test('the caret and its paragraph come back after a reload', async () => {
		const visual = new VisualEditor(texpile().page, texpile().root);
		const { page } = visual;
		await visual.open('long.tex');
		await settled(page);
		const paragraphNumber = await clickMidFile(page);
		expect(paragraphNumber, 'the caret is in a numbered paragraph').not.toBe('');
		await page.reload();
		await expect.poll(() => caretParagraph(page).catch(() => 'not mounted'), { timeout: 60_000 }).toBe(paragraphNumber);
		await settled(page);
		const shown = await inCanvas(page, ({ probe, view }) => {
			const pane = view.canvas.scroller.getBoundingClientRect();
			const caret = probe.carets().find((drawn) => drawn.kind === 'local' || drawn.kind === 'blur');
			return !!caret && caret.rect.top >= pane.top && caret.rect.bottom <= pane.bottom;
		});
		expect(shown, 'the caret is drawn on screen').toBe(true);
	});
});

for (const scale of [1, 1.5]) {
	test.describe(`with comments at ${scale * 100} percent`, () => {
		const texpile = useTexpile({ files: filesWithThreads, scale });

		test('the comment cards show with the first rows and stay', async () => {
			const { page, root } = texpile();
			const visual = new VisualEditor(page, root);
			await setTheme(page, 'light');
			await recordShownRows(page);
			await visual.open('long.tex');
			await settled(page);
			await quietFrames(page);
			const opened = expectStill(await stopShownRows(page), 'long.tex', 'the first open with comments');
			expect(
				opened.rows.some(([text]) => text.startsWith('card ')),
				'the comment card shows with the first rows'
			).toBe(true);
			expect(await probeErrors(page)).toEqual([]);
		});
	});
}
