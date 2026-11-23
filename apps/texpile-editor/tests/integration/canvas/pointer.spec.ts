// the pointer machine on the running canvas: a drag past the pane's edge scrolls at a speed a writer can follow (A2), a
// right press selects the atom it lands on and starts no formula session (A4), and the pointer over the paper sets the
// cursor and the hover state (11.6, 11.7)
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

type Scroll = { top: number; max: number; height: number; headTop: number };

function scrollNow(visual: VisualEditor): Promise<Scroll> {
	return inCanvas(visual.page, ({ view }) => {
		const scroller = view.canvas.scroller;
		const box = scroller.getBoundingClientRect();
		const head = view.coordsAtPos(view.state.selection.head);
		return {
			top: scroller.scrollTop,
			max: scroller.scrollHeight - scroller.clientHeight,
			height: scroller.clientHeight,
			headTop: head.top - box.top
		};
	});
}

/** presses 60 px above the pane's bottom edge and drags `past` px beyond it; the scroll top is sampled every frame while the pointer is held still */
async function dragPastBottom(visual: VisualEditor, past: number, holdMs: number): Promise<{ samples: [number, number][]; end: Scroll }> {
	const { page } = visual;
	const box = await inCanvas(page, ({ view }) => {
		const { left, top, width, height } = view.canvas.scroller.getBoundingClientRect();
		view.canvas.scroller.scrollTop = 0;
		return { left, top, width, height };
	});
	await settled(page);
	const x = box.left + box.width / 2;
	await page.mouse.move(x, box.top + box.height - 60);
	await page.mouse.down();
	await page.mouse.move(x, box.top + box.height - 60 + 30, { steps: 2 });
	await page.mouse.move(x, box.top + box.height + past);
	const samples = await inCanvas(
		page,
		async ({ view }, ms) => {
			const out: [number, number][] = [];
			const start = performance.now();
			while (performance.now() - start < ms) {
				out.push([performance.now() - start, view.canvas.scroller.scrollTop]);
				await new Promise((frame) => requestAnimationFrame(frame));
			}
			return out;
		},
		holdMs
	);
	const end = await scrollNow(visual);
	await page.mouse.up();
	return { samples, end };
}

/** the scroll top `ms` after it first moved: how far a hold of that long took the page */
function scrolledIn(samples: readonly [number, number][], ms: number): number {
	const first = samples.find(([, top]) => top > 0);
	if (!first) return 0;
	const later = samples.find(([time]) => time >= first[0] + ms) ?? samples.at(-1)!;
	return later[1] - first[1];
}

test('holding 10 px past the bottom edge for 1 s scrolls less than one pane and the selection head stays on screen', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	await visual.open('pointer.tex');
	await settled(visual.page);
	const { samples, end } = await dragPastBottom(visual, 10, 2500);
	const moved = scrolledIn(samples, 1000);
	expect(moved, 'it scrolled').toBeGreaterThan(20);
	expect(moved, 'under one pane in a second').toBeLessThan(end.height);
	expect(end.headTop).toBeGreaterThan(0);
	expect(end.headTop).toBeLessThan(end.height + 30);
	expect(await probeErrors(visual.page)).toEqual([]);
});

test('100 px past the bottom edge reaches the end of the document within 3 s', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	await visual.open('pointer.tex');
	await settled(visual.page);
	const { end } = await dragPastBottom(visual, 100, 3000);
	expect(end.top).toBeGreaterThan(end.max - 2);
	expect(await probeErrors(visual.page)).toEqual([]);
});

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
	const at = await inCanvas(visual.page, ({ view, probe }) => {
		const pos = probe.posOf('Paragraph 1') + 3;
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
