import { expect, test } from '@playwright/test';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

const WORDS = 'the statement keeps going for several lines so that the breaker has real choices to make between its lines';
const LEADS = `\\documentclass{article}
\\usepackage{amsthm}
\\newtheorem{theorem}{Theorem}
\\begin{document}

\\section{A heading that is long enough to run over the end of its first line and on to a second}

\\begin{theorem}
THEOREM ${WORDS}, ${WORDS}.
\\end{theorem}

PLAIN ${WORDS}, ${WORDS}.

\\begin{thebibliography}{9}
\\bibitem{okafor2021} ENTRY Okafor and Lindqvist, ${WORDS}, ${WORDS}.
\\end{thebibliography}

\\end{document}
`;

const texpile = useTexpile({ files: { 'leads.tex': LEADS } });
const visual = () => new VisualEditor(texpile().page, texpile().root);

type DrawnBlock = { held: boolean; justified: boolean; over: number };

/** how the block holding `text` is drawn, and how far its widest line runs past its right edge */
async function drawnBlock(v: VisualEditor, text: string): Promise<DrawnBlock> {
	return v.evalView<DrawnBlock>(
		`const block = [...view.dom.querySelectorAll('p, h1, h2')].find((el) => el.textContent.includes(arg));
		return { held: block.classList.contains('pm-line-par'), justified: block.classList.contains('pm-line-justified'), over: block.scrollWidth - block.clientWidth };`,
		text
	);
}

test('a first line makes room for a heading number, a theorem head and a bibliography key', async () => {
	const v = visual();
	await v.open('leads.tex');
	await expect.poll(() => drawnBlock(v, 'A heading that is long')).toEqual({ held: true, justified: false, over: 0 });
	await expect.poll(() => drawnBlock(v, 'THEOREM')).toEqual({ held: true, justified: true, over: 0 });
	await expect.poll(() => drawnBlock(v, 'ENTRY')).toEqual({ held: true, justified: true, over: 0 });
});

test('a paragraph put into a list keeps its justified lines', async () => {
	const v = visual();
	await v.open('leads.tex');
	await v.caretAfter('PLAIN');
	await v.page.getByRole('button', { name: 'Bullet List' }).click();
	await expect.poll(() => v.evalView<boolean>(`return view.dom.querySelector('.list-content p') !== null;`)).toBe(true);
	await expect.poll(() => drawnBlock(v, 'PLAIN')).toEqual({ held: true, justified: true, over: 0 });
});
