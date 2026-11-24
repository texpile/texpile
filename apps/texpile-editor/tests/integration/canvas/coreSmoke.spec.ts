// the canvas core in all three editors: each document opens, takes typing, scrolls and saves, and a save without an edit
// writes the file byte for byte. The parity documents (18.2) join when TEXPILE_PARITY_DOCS has them
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { Disk } from '../driver/disk';
import { useTexpile } from '../driver/useTexpile';
import { VisualEditor } from '../driver/visualEditor';
import { inCanvas, probeErrors, settled } from './canvasPage';

const DOCS = process.env.TEXPILE_PARITY_DOCS ?? '/home/user/texpile-tools/perf-drive/work/docs';
// the parity documents' figures point outside the folder the window has a copy of
const MISSING_FIGURE = /Failed to load resource: the server responded with a status of 40[34]/;
const TYPED = ' zqxv';

const PARITY_DOCUMENTS = [
	'parity-tex-tables/main.tex',
	'parity-tex-theorems/main.tex',
	'parity-tex-article/main.tex',
	'p2304/main.tex',
	'parity-typ-typst-paper/main.typ',
	'parity-typ-typst-report/chapters/method.typ',
	'parity-typ-typst-slides/main.typ',
	'parity-typ-drive/matrix.pristine.typ',
	'parity-typ-drive/drawn.pristine.typ',
	'parity-typ-drive/gone-kinds.pristine.typ',
	'parity-md-root/feature-sweep.md',
	'parity-md-root/typing.md',
	'parity-md-root/getting-started.md',
	'parity-md-markdown/README.md',
	'parity-md-latex/README.md'
];

const OWN_DOCUMENTS: Record<string, string> = {
	'smoke.typ': [
		'= Smoke',
		'',
		'A paragraph with *strong* words and $x^2$ inline.',
		'',
		'- one',
		'- two',
		'',
		'$ a + b = c $',
		'',
		'The last paragraph.',
		''
	].join('\n'),
	'smoke.md': [
		'# Smoke',
		'',
		'A paragraph with **strong** words and $x^2$ inline.',
		'',
		'- one',
		'- two',
		'',
		'| a | b |',
		'| - | - |',
		'| 1 | 2 |',
		'',
		'The last paragraph.',
		''
	].join('\n')
};

const parity = Object.fromEntries(
	PARITY_DOCUMENTS.filter((rel) => fs.existsSync(path.join(DOCS, rel))).map((rel) => [rel, fs.readFileSync(path.join(DOCS, rel), 'utf8')])
);
const texpile = useTexpile({ files: { ...OWN_DOCUMENTS, ...parity } });

function expectOnlyFigureErrors(): void {
	expect(
		texpile()
			.takeErrors()
			.filter((error) => !MISSING_FIGURE.test(error))
	).toEqual([]);
}

/** the end of the first paragraph that holds text, where the test types */
function firstParagraphEnd(visual: VisualEditor): Promise<number> {
	return inCanvas(visual.page, ({ view }) => {
		let end = -1;
		view.state.doc.descendants((node, pos) => {
			if (end >= 0) return false;
			if (node.type.name === 'paragraph' && node.textContent.trim().length > 0) end = pos + node.nodeSize - 1;
			return end < 0;
		});
		return end;
	});
}

async function scrollThrough(visual: VisualEditor): Promise<void> {
	for (const fraction of [0.25, 0.5, 0.75, 1, 0]) {
		await inCanvas(
			visual.page,
			({ view }, at) => {
				const { scroller } = view.canvas;
				scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) * at;
			},
			fraction
		);
		await settled(visual.page);
		const frames = await inCanvas(visual.page, ({ probe }) => probe.frameStats().frames);
		expect(frames, `frames drawn at ${fraction} of the document`).toBeGreaterThan(0);
	}
	// estimated heights above the end settle as the reader scrolls there, so a second scroll may be needed
	const lastBlockShown = async (): Promise<boolean> => {
		await inCanvas(visual.page, ({ view }) => {
			view.canvas.scroller.scrollTop = view.canvas.scroller.scrollHeight;
		});
		await settled(visual.page);
		return inCanvas(visual.page, ({ probe, view }) => {
			const last = view.state.doc.content.size - view.state.doc.lastChild!.nodeSize;
			const rect = probe.rectOfNode(last)!;
			const pane = view.canvas.scroller.getBoundingClientRect();
			return rect.top < pane.bottom && rect.bottom > pane.top;
		});
	};
	await expect.poll(lastBlockShown, { message: 'the last block on screen once scrolled to the end' }).toBe(true);
}

for (const rel of [...Object.keys(OWN_DOCUMENTS), 'main.tex', ...PARITY_DOCUMENTS]) {
	test(`${rel} opens, types, scrolls and saves on the canvas`, async () => {
		test.skip(!(rel in parity) && PARITY_DOCUMENTS.includes(rel), `no ${path.join(DOCS, rel)}`);
		test.setTimeout(240_000);
		const visual = new VisualEditor(texpile().page, texpile().root);
		const disk = new Disk(texpile().root);
		const original = disk.readBytes(rel);
		await visual.open(rel);
		await settled(visual.page);

		await visual.page.keyboard.press('ControlOrMeta+s');
		await disk.expectUnchanged(rel, original.toString('utf8'));
		expect(disk.readBytes(rel).equals(original), `${rel} after a save without an edit`).toBe(true);

		const end = await firstParagraphEnd(visual);
		expect(end, 'a paragraph with text').toBeGreaterThan(0);
		await inCanvas(
			visual.page,
			({ probe, view }, at) => {
				probe.select(at);
				view.focus();
			},
			end
		);
		await visual.type(TYPED);
		// the serializer may wrap the edited paragraph at the typed space
		await disk.expectFile(rel, (text) => text.includes(TYPED.trim()), `${rel} after typing`);
		for (let i = 0; i < TYPED.length; i++) await visual.press('Backspace');
		await disk.expectFile(rel, (text) => text === original.toString('utf8'), `${rel} after deleting what was typed`);
		expect(disk.readBytes(rel).equals(original), `${rel} byte for byte after the typing was taken back`).toBe(true);

		await scrollThrough(visual);
		expect(await probeErrors(visual.page)).toEqual([]);
		expectOnlyFigureErrors();
	});
}
