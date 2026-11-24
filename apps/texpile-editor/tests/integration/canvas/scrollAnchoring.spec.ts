// G14: content above the viewport changing height leaves the top visible line where it was on screen
import { expect, test } from '@playwright/test';
import { useTexpile } from '../driver/useTexpile';
import { VisualEditor } from '../driver/visualEditor';
import { inCanvas, probeErrors, settled } from './canvasPage';

const paragraphs = Array.from(
	{ length: 160 },
	(_, i) => `Paragraph ${i} holds enough words to wrap over two lines of the column, so the document runs many screens long.`
);
const body = paragraphs.map((text, i) => (i % 20 === 10 ? `${text}\n\n\\[ x_{${i}}^2 + y_{${i}}^2 \\]` : text)).join('\n\n');
const texpile = useTexpile({ files: { 'anchor.tex': `\\documentclass{article}\n\\begin{document}\n\n${body}\n\n\\end{document}\n` } });

type TopLine = { pos: number; top: number };

/** the caret place under the pane's top edge and that place's client top */
function topLine(visual: VisualEditor): Promise<TopLine> {
	return inCanvas(visual.page, ({ probe, view }) => {
		const pane = view.canvas.scroller.getBoundingClientRect();
		const column = view.dom.getBoundingClientRect();
		const hit = probe.hitAt(column.left + 40, pane.top + 12)!;
		return { pos: hit.caret.pos, top: probe.rectOf(hit.caret.pos)!.top };
	});
}

/** a read once the frames caught up: an idle slice can lay out a block above between frames, moving the tops a frame
 *  before the scroller follows, so two reads a settle apart must agree */
async function settledRead<T>(visual: VisualEditor, read: () => Promise<T>): Promise<T> {
	let last: string | null = null;
	for (let tries = 0; tries < 60; tries++) {
		await settled(visual.page);
		const now = await read();
		if (JSON.stringify(now) === last) return now;
		last = JSON.stringify(now);
	}
	throw new Error('the frames never caught up');
}

test('a block growing above the viewport leaves the top line still', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	await visual.open('anchor.tex');
	await inCanvas(visual.page, ({ view }) => {
		const { scroller } = view.canvas;
		scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) * 0.6;
	});
	const before = await settledRead(visual, () => topLine(visual));
	const grown = await inCanvas(visual.page, ({ view }) => {
		const paragraph = view.state.doc.firstChild!;
		const words = ' and a collaborator added this sentence to it.'.repeat(12);
		view.dispatch(view.state.tr.insertText(words, paragraph.nodeSize - 1).setMeta('addToHistory', false));
		return words.length;
	});
	const after = await settledRead(visual, () => inCanvas(visual.page, ({ probe }, pos) => probe.rectOf(pos)!.top, before.pos + grown));
	expect(Math.abs(after - before.top), 'the top line kept its place on screen').toBeLessThan(1);
	expect(await probeErrors(visual.page)).toEqual([]);
});
