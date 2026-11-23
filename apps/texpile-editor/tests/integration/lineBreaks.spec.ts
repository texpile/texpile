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

/** justified: every line but the last stretched to the measure; over: how far the widest line runs past the block */
type DrawnBlock = { lines: number; justified: boolean; over: number };

type ProbeLine = { from: number; to: number; text: string; justified: boolean };
type ProbeView = {
	lines(pos: number): ProbeLine[];
	rectOf(pos: number): DOMRect | null;
	rectOfNode(pos: number): DOMRect | null;
	settle(): Promise<void>;
	carets(): { kind: string; label?: string }[];
	errors(): unknown[];
};

async function openWithProbe(v: VisualEditor, file: string): Promise<void> {
	await v.open(file);
	const hasProbe = await v.page.evaluate(() => '__canvasProbe' in window);
	test.skip(!hasProbe, 'the canvas probe arrives with the view core');
}

/** how the textblock holding `text` is drawn */
async function drawnBlock(v: VisualEditor, text: string): Promise<DrawnBlock> {
	const pos = await v.evalView<number>(
		`let found = -1;
		view.state.doc.descendants((node, pos) => { if (found < 0 && node.isTextblock && node.textContent.includes(arg)) found = pos; });
		return found;`,
		text
	);
	return v.page.evaluate(async (pos) => {
		const view = (window as unknown as { __canvasProbe: { active(): ProbeView } }).__canvasProbe.active();
		await view.settle();
		const block = view.rectOfNode(pos)!;
		const lines = view.lines(pos);
		// a line's last character, before the spaces it ends on
		const ends = lines.map((line) => view.rectOf(line.from + line.text.trimEnd().length)?.left ?? block.right);
		return {
			lines: lines.length,
			justified: lines.length > 1 && lines.slice(0, -1).every((line) => line.justified),
			over: Math.max(0, Math.round(Math.max(...ends) - block.right))
		};
	}, pos);
}

test.afterEach(async () => {
	const hasProbe = await texpile().page.evaluate(() => '__canvasProbe' in window);
	if (!hasProbe) return;
	const errors = await texpile().page.evaluate(() =>
		(window as unknown as { __canvasProbe: { active(): ProbeView } }).__canvasProbe.active().errors()
	);
	expect(errors).toEqual([]);
});

test('a first line makes room for a heading number, a theorem head and a bibliography key', async () => {
	const v = visual();
	await openWithProbe(v, 'leads.tex');
	await expect.poll(() => drawnBlock(v, 'A heading that is long')).toEqual({ lines: 2, justified: false, over: 0 });
	await expect.poll(() => drawnBlock(v, 'THEOREM')).toMatchObject({ justified: true, over: 0 });
	await expect.poll(() => drawnBlock(v, 'ENTRY')).toMatchObject({ justified: true, over: 0 });
});

test('a paragraph put into a list keeps its justified lines', async () => {
	const v = visual();
	await openWithProbe(v, 'leads.tex');
	await v.caretAfter('PLAIN');
	await v.page.getByRole('button', { name: 'Bullet List' }).click();
	await expect.poll(() => v.evalView<string>(`return view.state.doc.resolve(view.state.selection.head).node(-1).type.name;`)).toBe('list');
	await expect.poll(() => drawnBlock(v, 'PLAIN')).toMatchObject({ justified: true, over: 0 });
});

test('a paragraph with inline code keeps its justified lines', async () => {
	const v = visual();
	await openWithProbe(v, 'leads.tex');
	await expect.poll(() => drawnBlock(v, 'CODE')).toMatchObject({ justified: true, over: 0 });
});

test('the name label of a peer whose caret is near the end of a line leaves the paragraph justified', async () => {
	const v = visual();
	await openWithProbe(v, 'leads.tex');
	await expect.poll(() => drawnBlock(v, 'PLAIN')).toMatchObject({ justified: true, over: 0 });
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
	await expect
		.poll(() =>
			v.page.evaluate(() =>
				(window as unknown as { __canvasProbe: { active(): ProbeView } }).__canvasProbe
					.active()
					.carets()
					.some((caret) => caret.kind === 'remote' && caret.label === 'A collaborator with a long name')
			)
		)
		.toBe(true);
	await expect.poll(() => drawnBlock(v, 'PLAIN')).toMatchObject({ justified: true, over: 0 });
});

test('a Typst heading keeps its label chip on the last line while words are typed before it', async () => {
	const v = visual();
	await openWithProbe(v, 'labeled.typ');
	await expect.poll(() => drawnBlock(v, 'A heading that is long')).toMatchObject({ justified: false, over: 0 });
	await v.caretAfter('and then on');
	for (const word of [' to', ' a', ' second', ' line', ' of', ' words', ' typed', ' here']) {
		await v.type(word);
		await expect.poll(() => drawnBlock(v, 'A heading that is long')).toMatchObject({ justified: false, over: 0 });
	}
});
