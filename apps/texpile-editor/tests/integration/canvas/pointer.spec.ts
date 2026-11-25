// the pointer machine on the running canvas: a right press selects the atom it lands on and starts no formula session
// (A4), and the pointer over the paper sets the cursor and the hover state (11.6, 11.7)
import { expect, test } from '@playwright/test';
import { useTexpile } from '../driver/useTexpile';
import { VisualEditor } from '../driver/visualEditor';
import { inCanvas, probeErrors, settled } from './canvasPage';

const SENTENCE = 'Plain words fill every paragraph of this long page so that a drag has somewhere to go, line after line after line.';
const BODY = Array.from(
	{ length: 70 },
	(_, i) => `${SENTENCE} Paragraph ${i}${i === 3 ? ' with $x^2$ inside and a citation~\\cite{key}' : ''}.`
).join('\n\n');
const FILES = { 'pointer.tex': ['\\documentclass{article}', '\\begin{document}', BODY, '\\end{document}', ''].join('\n') };

const texpile = useTexpile({ files: FILES });

test('a right press on a formula or a citation selects it and starts no formula session; inside a selection it keeps it', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	await visual.open('pointer.tex');
	await settled(visual.page);
	const atoms = await inCanvas(visual.page, ({ view, probe }) => {
		const found: { pos: number; type: string; x: number; y: number }[] = [];
		const first = probe.posOf('Paragraph 3');
		view.canvas.scroller.scrollTop += view.coordsAtPos(first).top - view.canvas.scroller.getBoundingClientRect().top - 120;
		view.state.doc.descendants((node, pos) => {
			if (node.isInline && node.isAtom && !node.isText && /math|citation/.test(node.type.name))
				found.push({ pos, type: node.type.name, x: 0, y: 0 });
		});
		return found;
	});
	await settled(visual.page);
	expect(atoms.map((atom) => atom.type).sort()).toEqual(['citation', 'inline_math']);
	for (const atom of atoms) {
		await visual.evalView('view.dispatch(view.state.tr.setSelection(view.state.selection.constructor.atStart(view.state.doc)));');
		await settled(visual.page);
		const at = await inCanvas(
			visual.page,
			({ probe }, pos) => {
				const rect = probe.rectOfNode(pos)!;
				return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
			},
			atom.pos
		);
		await visual.page.mouse.click(at.x, at.y, { button: 'right' });
		await settled(visual.page);
		const state = await inCanvas(visual.page, ({ view }) => ({
			selection: view.state.selection.toJSON() as { type: string; anchor: number },
			session: view.canvas.nested() !== null
		}));
		expect(state.selection, `right press on the ${atom.type}`).toEqual({ type: 'node', anchor: atom.pos });
		expect(state.session, 'no formula session').toBe(false);
		// the app's menu opens at the press and would cover the next atom
		await visual.page.keyboard.press('Escape');
	}
	expect(await probeErrors(visual.page)).toEqual([]);
});

test('the pointer over text shows the text cursor, the hover state follows the node without a style storm', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	await visual.open('pointer.tex');
	await settled(visual.page);
	const at = await inCanvas(visual.page, async ({ view, probe }) => {
		const pos = probe.posOf('Paragraph 1') + 3;
		view.canvas.revealPos(pos, 'center');
		await probe.settle();
		const rect = view.coordsAtPos(pos);
		return { x: rect.left, y: (rect.top + rect.bottom) / 2, pos };
	});
	const reads = () => inCanvas(visual.page, ({ probe }) => probe.frameStats().styleReads);
	const before = await reads();
	await visual.page.mouse.move(at.x - 5, at.y);
	await visual.page.mouse.move(at.x, at.y);
	await expect
		.poll(() => inCanvas(visual.page, ({ view }) => ({ cursor: view.dom.style.cursor, block: view.canvas.hover.blockFor })))
		.toMatchObject({ cursor: 'text' });
	await expect.poll(() => inCanvas(visual.page, ({ view }) => view.canvas.hover.chain.length)).toBeGreaterThan(0);
	for (let step = 0; step < 20; step++) await visual.page.mouse.move(at.x + step * 7, at.y + (step % 3) * 30);
	await settled(visual.page);
	expect((await reads()) - before, 'style reads for twenty hover moves').toBeLessThan(400);
	await visual.page.mouse.move(2, 2);
	await expect.poll(() => inCanvas(visual.page, ({ view }) => view.canvas.hover.chain.length)).toBe(0);
	expect(await probeErrors(visual.page)).toEqual([]);
});

test('dragging a selected word onto another paragraph moves it there', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	await visual.open('pointer.tex');
	await settled(visual.page);
	const word = await inCanvas(visual.page, ({ probe }) => probe.posOf('fill every'));
	await visual.evalView(
		'const S = view.state.selection.constructor; view.dispatch(view.state.tr.setSelection(S.create(view.state.doc, arg, arg + 4)));',
		word
	);
	const at = await inCanvas(visual.page, ({ probe }) => ({
		from: probe.clientPointOf(probe.posOf('fill every') + 2, 1),
		to: probe.clientPointOf(probe.posOf('Paragraph 2'), 1)
	}));
	await settled(visual.page);
	await visual.page.mouse.move(at.from.x, at.from.y);
	await visual.page.mouse.down();
	await visual.page.mouse.move(at.to.x, at.to.y, { steps: 12 });
	await visual.page.mouse.up();
	await settled(visual.page);
	const lines = await visual.evalView<string[]>(
		"return view.state.doc.textBetween(0, view.state.doc.content.size, '\\n', '#').split('\\n');"
	);
	expect(lines[0]).toContain('Plain words  every paragraph');
	expect(lines[2]).toContain('line. fillParagraph 2.');
	expect(await probeErrors(visual.page)).toEqual([]);
});
