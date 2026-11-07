import { expect, test } from '@playwright/test';
import { Disk } from './driver/disk';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

const PAPER = `\\documentclass{article}
\\begin{document}

Intro.

\\begin{thebibliography}{9}
\\bibitem{knuth} D. Knuth. The Art of Computer Programming. 1968.
\\end{thebibliography}

\\end{document}
`;

const texpile = useTexpile({ files: { 'bib.tex': PAPER } });

test('Enter ends an entry and starts one whose key is typed into its chip', async () => {
	const { page, root } = texpile();
	const visual = new VisualEditor(page, root);
	const disk = new Disk(root);
	await visual.open('bib.tex');
	await expect(page.getByRole('heading', { name: 'References' })).toBeVisible();
	await visual.caretAtEndOf('The Art of Computer Programming');
	await visual.press('Enter');
	await visual.type('L. Lamport. LaTeX. 1986.');
	const chips = page.locator('.bib-key button');
	await expect(chips).toHaveCount(2);
	await chips.nth(1).click();
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
