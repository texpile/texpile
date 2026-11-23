import { expect, test } from '@playwright/test';
import { Disk } from './driver/disk';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';
import { inCanvas } from './canvas/canvasPage';

const PAPER = `\\documentclass{article}
\\begin{document}

Intro.

\\begin{thebibliography}{9}
\\bibitem{knuth} D. Knuth. The Art of Computer Programming. 1968.
\\end{thebibliography}

\\end{document}
`;

const texpile = useTexpile({ files: { 'bib.tex': PAPER } });

test('the heading and each key line up with the text column, with no list bullet', async () => {
	const { page, root } = texpile();
	const visual = new VisualEditor(page, root);
	await visual.open('bib.tex');
	await expect.poll(() => inCanvas(page, ({ probe }) => probe.query('.bib-key .text-chip').length)).toBe(1);
	const drawn = await inCanvas(page, ({ probe }) => ({
		column: probe.query('p')[0].rect.left,
		heading: probe.query('h1.bibliography-heading')[0].rect,
		chip: probe.query('.bib-key .text-chip')[0].rect.left,
		bullets: probe.paintedLines().lines.filter((line) => line.text.includes('\u2022')).length
	}));
	expect(drawn.heading.left).toBe(drawn.column);
	expect(drawn.heading.height).toBeGreaterThan(30);
	expect(drawn.chip).toBe(drawn.column);
	expect(drawn.bullets).toBe(0);
});

test('Enter ends an entry and starts one whose key is typed into its chip', async () => {
	const { page, root } = texpile();
	const visual = new VisualEditor(page, root);
	const disk = new Disk(root);
	await visual.open('bib.tex');
	await expect.poll(() => inCanvas(page, ({ probe }) => probe.query('h1.bibliography-heading')[0]?.text ?? '')).toBe('References');
	await visual.caretAtEndOf('The Art of Computer Programming');
	await visual.press('Enter');
	await visual.type('L. Lamport. LaTeX. 1986.');
	const chips = () => inCanvas(page, ({ probe }) => probe.query('.bib-key .text-chip').map((chip) => chip.rect));
	await expect.poll(async () => (await chips()).length).toBe(2);
	const second = (await chips())[1];
	await page.mouse.click(second.left + second.width / 2, second.top + second.height / 2);
	const source = page.locator('.drawn-chip-panel .cm-content');
	await expect(source).toBeFocused();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.type('\\bibitem{lamport}');
	await page.keyboard.press('Enter');
	await disk.expectFile(
		'bib.tex',
		(text) =>
			text.includes('\\bibitem{knuth} D. Knuth.') && text.includes('\\bibitem{lamport} L. Lamport. LaTeX. 1986.\n\\end{thebibliography}'),
		'the new entry is saved with its key'
	);
});
