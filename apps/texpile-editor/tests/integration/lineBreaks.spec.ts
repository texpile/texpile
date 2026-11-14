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

CODE ${WORDS} with \\texttt{a code name} in it, ${WORDS} and \\texttt{another one} at its end.

\\begin{thebibliography}{9}
\\bibitem{okafor2021} ENTRY Okafor and Lindqvist, ${WORDS}, ${WORDS}.
\\end{thebibliography}

\\end{document}
`;

const LABELED = `= A heading that is long enough to run over the end of its first line and then on <sec-long>

Text below the heading.
`;

const texpile = useTexpile({ files: { 'leads.tex': LEADS, 'labeled.typ': LABELED } });
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

test('a paragraph with inline code keeps its justified lines', async () => {
	const v = visual();
	await v.open('leads.tex');
	await expect.poll(() => drawnBlock(v, 'CODE')).toEqual({ held: true, justified: true, over: 0 });
});

test('the name label of a peer whose caret is near the end of a line leaves the paragraph held', async () => {
	const v = visual();
	await v.open('leads.tex');
	await expect.poll(() => drawnBlock(v, 'PLAIN')).toEqual({ held: true, justified: true, over: 0 });
	// three characters before the end of the paragraph's first line, where the label runs past the edge
	await v.evalView(
		`let start = -1;
		view.state.doc.descendants((node, pos) => { if (start < 0 && node.isTextblock && node.textContent.startsWith('PLAIN')) start = pos + 1; });
		const top = view.coordsAtPos(start).top;
		let at = start;
		while (view.coordsAtPos(at + 1).top < top + 4) at++;
		const plugin = view.state.plugins.find((p) => p.key.startsWith('remote-cursors'));
		const peer = { clientId: 7, name: 'A collaborator with a long name', color: '#d97706', anchor: at - 3, head: at - 3 };
		view.dispatch(view.state.tr.setMeta(plugin.key, [peer]).setMeta('addToHistory', false));`
	);
	await expect.poll(() => v.evalView<boolean>(`return view.dom.querySelector('.pm-remote-caret-label') !== null;`)).toBe(true);
	await v.page.waitForTimeout(400);
	const drawn = await drawnBlock(v, 'PLAIN');
	expect(drawn.over, 'the label runs past the edge').toBeGreaterThan(2);
	expect(drawn.held).toBe(true);
});

test('a Typst heading stays held with its label chip on the last line while words are typed before it', async () => {
	const v = visual();
	await v.open('labeled.typ');
	await expect.poll(() => drawnBlock(v, 'A heading that is long')).toEqual({ held: true, justified: false, over: 0 });
	await v.caretAfter('and then on');
	for (const word of [' to', ' a', ' second', ' line', ' of', ' words', ' typed', ' here']) {
		await v.type(word);
		await expect.poll(() => drawnBlock(v, 'A heading that is long')).toEqual({ held: true, justified: false, over: 0 });
	}
});
