// W4's slice (20.2): a comment tint and a peer caret with its name label drawn in LaTeX, Typst and Markdown, read
// through the probe: the tint hugs the commented words once, a peer's selection fills its line box, the caret sits
// at the peer's place with the name over it, and typing or resolving the thread leaves no tint behind
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { useTexpile } from '../../driver/useTexpile';
import { VisualEditor } from '../../driver/visualEditor';
import { inCanvas, probeErrors, settled } from '../canvasPage';

const PARAGRAPH = 'A paragraph for the remote collaborator to stand in, with enough words to wrap across more than one line.';
const FILES: Record<string, string> = {
	'slice.tex': [
		'\\documentclass{article}',
		'\\begin{document}',
		PARAGRAPH,
		'',
		'See it for the start, and the end.',
		'\\end{document}',
		''
	].join('\n'),
	'slice.typ': [PARAGRAPH, '', 'See it for the start, and the end.', ''].join('\n'),
	'slice.md': [PARAGRAPH, '', 'See it for the start, and the end.', ''].join('\n')
};

const texpile = useTexpile({ files: FILES });

type Box = { left: number; top: number; width: number; height: number };
type Drawn = {
	/** the fills of the commented paragraph in the comment's color */
	tints: Box[];
	/** the commented words' caret rects at their two ends */
	from: Box;
	to: Box;
	/** the peer selection's fills and the line it is on */
	shade: Box[];
	line: { top: number; height: number };
	peers: { label: string; left: number; top: number; height: number }[];
	peerAt: Box;
};

/** sets a thread over "enough words", a peer at "to stand" and one selecting "for the start"; what the frame drew */
function drawWithPeers(visual: VisualEditor): Promise<Drawn> {
	return inCanvas(visual.page, async ({ probe, view }) => {
		const pluginOf = (name: string) =>
			view.state.plugins.find((plugin) => String((plugin as unknown as { key: string }).key).startsWith(name))!;
		const from = probe.posOf('enough words');
		const to = from + 'enough words'.length;
		const at = probe.posOf('to stand');
		const start = probe.posOf('for the start');
		view.dispatch(view.state.tr.setMeta(pluginOf('texpile-comments'), { type: 'set', ranges: [{ id: 't1', from, to, resolved: false }] }));
		const peers = [
			{ clientId: 7, name: 'Ada', color: '#7c3aed', anchor: at, head: at },
			{ clientId: 8, name: 'Sam', color: '#0d9488', anchor: start, head: start + 'for the start'.length }
		];
		view.dispatch(view.state.tr.setMeta(pluginOf('remote-cursors'), peers).setMeta('addToHistory', false));
		await probe.settle();
		const blockOf = (pos: number) => view.state.doc.resolve(pos).before(1);
		const box = (rect: DOMRect | null) => ({ left: rect!.left, top: rect!.top, width: rect!.width, height: rect!.height });
		const fills = (pos: number, color: RegExp) =>
			probe
				.drawList(blockOf(pos))
				.filter((op) => op.op === 'fillRect' && color.test(op.color ?? ''))
				.map((op) => box(view.canvas.clientRect(op.rect)));
		const line = probe.lines(blockOf(start)).find((each) => each.from <= start && each.to >= start)!;
		return {
			tints: fills(from, /^rgba\(234, 179, 8, 0\.14/),
			from: box(probe.rectOf(from)),
			to: box(probe.rectOf(to)),
			shade: fills(start, /^rgba\(13, 148, 136, 0\.2/),
			line: { top: line.top, height: line.height },
			peers: probe
				.carets()
				.filter((caret) => caret.kind === 'remote')
				.map((caret) => ({ label: caret.label ?? '', left: caret.rect.left, top: caret.rect.top, height: caret.rect.height })),
			peerAt: box(probe.rectOf(at))
		};
	});
}

for (const file of Object.keys(FILES)) {
	test(`${file}: a comment tint and a peer caret with its name are drawn`, async () => {
		const visual = new VisualEditor(texpile().page, texpile().root);
		await visual.open(file);
		await settled(visual.page);

		const drawn = await drawWithPeers(visual);
		expect(drawn.tints, 'the thread is tinted once, over its words').toHaveLength(1);
		const [tint] = drawn.tints;
		expect(tint.left).toBeCloseTo(drawn.from.left, 0);
		expect(tint.left + tint.width).toBeCloseTo(drawn.to.left, 0);
		expect(tint.top, 'a thread hugs the text').toBeCloseTo(drawn.from.top, 0);
		expect(tint.height).toBeCloseTo(drawn.from.height, 0);

		expect(drawn.shade, "a peer's selection is one fill").toHaveLength(1);
		expect(drawn.shade[0].top, "a peer's selection reaches the line box").toBeCloseTo(drawn.line.top, 0);
		expect(drawn.shade[0].height).toBeCloseTo(drawn.line.height, 0);

		expect(drawn.peers.map((peer) => peer.label).sort()).toEqual(['Ada', 'Sam']);
		const ada = drawn.peers.find((peer) => peer.label === 'Ada')!;
		expect(ada.left, 'the bar starts a pixel before the place').toBeCloseTo(drawn.peerAt.left - 1, 0);
		expect(ada.top).toBeCloseTo(drawn.peerAt.top, 0);

		// typing in the paragraph lays it out again: the tint stays single and goes with the thread
		await inCanvas(visual.page, ({ probe, view }) => {
			view.focus();
			probe.select(probe.posOf('A paragraph'));
		});
		await visual.page.keyboard.type('So ');
		await settled(visual.page);
		const typed = await inCanvas(visual.page, ({ probe, view }) => {
			const pos = probe.posOf('enough words');
			const fills = probe
				.drawList(view.state.doc.resolve(pos).before(1))
				.filter((op) => op.op === 'fillRect' && /^rgba\(234, 179, 8, 0\.14/.test(op.color ?? '')).length;
			return { fills, text: view.state.doc.resolve(pos).parent.textContent };
		});
		expect(typed.text.startsWith('So A paragraph')).toBe(true);
		expect(typed.fills).toBe(1);
		const resolved = await inCanvas(visual.page, async ({ probe, view }) => {
			const comments = view.state.plugins.find((plugin) =>
				String((plugin as unknown as { key: string }).key).startsWith('texpile-comments')
			)!;
			view.dispatch(view.state.tr.setMeta(comments, { type: 'set', ranges: [] }));
			await probe.settle();
			const pos = probe.posOf('enough words');
			return probe
				.drawList(view.state.doc.resolve(pos).before(1))
				.filter((op) => op.op === 'fillRect' && /^rgba\(234, 179, 8, 0\.14/.test(op.color ?? '')).length;
		});
		expect(resolved, 'a resolved thread leaves no tint').toBe(0);
		expect(await probeErrors(visual.page)).toEqual([]);
	});
}

/** the dots of a dotted proofread rule the frame drew under the word, and whether the proofreader flagged it */
function spellingDrawn(visual: VisualEditor, word: string): Promise<{ flagged: boolean; dots: number }> {
	return inCanvas(
		visual.page,
		async ({ probe, view }, word) => {
			await probe.settle();
			const from = probe.posOf(word);
			const to = from + word.length;
			const proofread = view.state.plugins.find((plugin) => String((plugin as unknown as { key: string }).key).startsWith('proofread'));
			const decor = (proofread?.getState(view.state) as { decor?: { find(from: number, to: number): unknown[] } } | undefined)?.decor;
			const flagged = !!decor?.find(from, to).length;
			const left = probe.rectOf(from)!.left;
			const right = probe.rectOf(to)!.left;
			const dots = probe
				.drawList(view.state.doc.resolve(from).before(1))
				.filter((op) => op.op === 'fillRect' && op.rect.width <= 2.5 && op.rect.height <= 2.5)
				.map((op) => view.canvas.clientRect(op.rect))
				.filter((rect) => rect.left >= left - 1 && rect.right <= right + 1).length;
			return { flagged, dots };
		},
		word
	);
}

test('A15: a misspelled word shows its mark once the caret leaves it, and a letter typed inside holds it again', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	await visual.page.evaluate(async () => {
		const config = await import(/* @vite-ignore */ '/src/lib/editor/spellcheck/config/spellcheckConfig.ts' as string);
		config.setSpellcheckEnabled(true);
	});
	await visual.open('slice.tex');
	await settled(visual.page);
	await visual.caretAfter('and the end.');
	await visual.page.keyboard.type(' We recieve', { delay: 30 });
	// past the proofreader's pause, while the caret is still in the word
	await expect.poll(async () => (await spellingDrawn(visual, 'recieve')).flagged, { timeout: 15_000 }).toBe(true);
	expect((await spellingDrawn(visual, 'recieve')).dots, 'no mark while the word is typed').toBe(0);
	await visual.page.keyboard.press('Space');
	await expect.poll(async () => (await spellingDrawn(visual, 'recieve')).dots).toBeGreaterThan(3);
	await visual.caretAfter('We reci');
	await settled(visual.page);
	expect((await spellingDrawn(visual, 'recieve')).dots, 'a click back in keeps it').toBeGreaterThan(3);
	await visual.page.keyboard.type('i');
	await settled(visual.page);
	expect((await spellingDrawn(visual, 'reciieve')).dots, 'a letter typed inside holds it').toBe(0);
	await visual.page.keyboard.press('ArrowRight');
	await expect.poll(async () => (await spellingDrawn(visual, 'reciieve')).dots, { timeout: 15_000 }).toBeGreaterThan(3);
});

type Rgba = { r: number; g: number; b: number; a: number };
type MarkRecording = {
	id: string;
	rows: [number, string, string, string, number, number][];
	initial: { paint: { backgroundColor: Rgba; borderColor: { bottom: Rgba } } };
	values: { paint: { backgroundColor?: Rgba; borderColor?: { bottom?: Rgba } }[] };
};

/** the mark ids recorded on parity-tex-body, each with the class of the elements that drew it in the DOM editor */
const RECORDED_MARKS: Record<string, string> = {
	comment: 'pm-comment',
	'comment-focused': 'pm-comment-focused',
	'proof-spelling': 'proofread-spelling',
	'proof-typo': 'proofread-typo',
	'proof-capitalization': 'proofread-capitalization',
	'proof-wordchoice': 'proofread-wordchoice',
	'proof-style': 'proofread-style',
	'proof-repetition': 'proofread-repetition',
	'proof-grammar': 'proofread-grammar',
	'suggest-insert': 'pm-suggest-new',
	'suggest-delete': 'pm-suggest-old',
	'suggest-replace-focused': 'pm-suggest-focused'
};

/** the background and bottom border colors the DOM editor computed for a mark, in 0 to 255 */
function recordedColors(scheme: 'light' | 'dark'): Record<string, number[][]> {
	const file = path.join(import.meta.dirname, '../../../fixtures/parity/styles', `parity-tex-body__main_tex@${scheme}.marks.json`);
	const { marks } = JSON.parse(fs.readFileSync(file, 'utf8')) as { marks: MarkRecording[] };
	const out: Record<string, number[][]> = {};
	for (const mark of marks) {
		const className = RECORDED_MARKS[mark.id];
		if (!className) continue;
		const colors = new Map<string, number[]>();
		for (const [, , rowPath, , , paintId] of mark.rows) {
			const last = rowPath.split('>').at(-1)!;
			if (!last.split(':')[0].split('.').includes(className)) continue;
			const paint = mark.values.paint[paintId] ?? {};
			// a recorded row holds only the channels that differ from the initial value
			for (const color of [
				{ ...mark.initial.paint.backgroundColor, ...paint.backgroundColor },
				{ ...mark.initial.paint.borderColor.bottom, ...paint.borderColor?.bottom }
			])
				if (color.a > 0) {
					const rgba = [color.r * 255, color.g * 255, color.b * 255, color.a];
					colors.set(rgba.map((v) => v.toFixed(2)).join(), rgba);
				}
		}
		out[mark.id] = [...colors.values()];
	}
	return out;
}

const parsedColor = (text: string) => /rgba?\(([^)]+)\)/.exec(text)?.[1].split(',').map(Number) ?? [];
const sameColor = (drawn: number[], want: number[]) =>
	drawn.length >= 3 && drawn.slice(0, 3).every((v, i) => Math.abs(v - want[i]) <= 2) && Math.abs((drawn[3] ?? 1) - want[3]) <= 0.02;

test('the marks draw in the colors the DOM editor computed for them', async () => {
	const expected = recordedColors('light');
	expect(Object.keys(expected)).toHaveLength(Object.keys(RECORDED_MARKS).length);
	const visual = new VisualEditor(texpile().page, texpile().root);
	await visual.open('slice.tex');
	await settled(visual.page);
	const missing: string[] = [];
	for (const id of Object.keys(RECORDED_MARKS)) {
		const drawn = await inCanvas(
			visual.page,
			async ({ probe, view }, mark) => {
				const send = (name: string, meta: unknown) => {
					const plugin = view.state.plugins.find((each) => String((each as unknown as { key: string }).key).startsWith(`${name}$`))!;
					view.dispatch(view.state.tr.setMeta(plugin, meta).setMeta('addToHistory', false));
				};
				const from = probe.posOf('enough words');
				const to = from + 'enough words'.length;
				send('texpile-comments', { type: 'set', ranges: [] });
				send('texpile-comments', { type: 'focus', id: null });
				send('texpile-suggestions', { type: 'set', ranges: [] });
				send('texpile-suggestions', { type: 'focus', id: null });
				view.setProps({ decorations: undefined });
				// the page's own prosemirror-view classes, read off a set the comments plugin made
				const comments = view.state.plugins.find((each) =>
					String((each as unknown as { key: string }).key).startsWith('texpile-comments$')
				)!;
				send('texpile-comments', { type: 'set', ranges: [{ id: 't0', from, to, resolved: false }] });
				const made = comments.props.decorations!.call(comments, view.state) as unknown as {
					find(): { constructor: unknown }[];
					constructor: unknown;
				};
				const DecorationSet = made.constructor as { create(doc: unknown, decorations: unknown[]): never };
				const Decoration = made.find()[0].constructor as { inline(from: number, to: number, attrs: object, spec: object): unknown };
				send('texpile-comments', { type: 'set', ranges: [] });
				const suggestion = { id: 's1', from, to, restore: '', mine: true, old: [] as unknown[], partial: false };
				const oldWords = [{ text: 'removed words', marks: [] }];
				if (mark.startsWith('comment')) {
					send('texpile-comments', { type: 'set', ranges: [{ id: 't1', from, to, resolved: false }] });
					if (mark === 'comment-focused') send('texpile-comments', { type: 'focus', id: 't1' });
				} else if (mark.startsWith('proof-')) {
					const kind = mark.slice('proof-'.length);
					view.setProps({
						decorations: (state: typeof view.state) =>
							DecorationSet.create(state.doc, [Decoration.inline(from, to, { class: `proofread-${kind}` }, { errors: [{ type: kind }] })])
					});
				} else if (mark === 'suggest-insert') send('texpile-suggestions', { type: 'set', ranges: [suggestion] });
				else if (mark === 'suggest-delete')
					send('texpile-suggestions', { type: 'set', ranges: [{ ...suggestion, to: from, restore: 'removed words', old: oldWords }] });
				else {
					send('texpile-suggestions', { type: 'set', ranges: [{ ...suggestion, restore: 'removed words', old: oldWords }] });
					send('texpile-suggestions', { type: 'focus', id: 's1' });
				}
				await probe.settle();
				const colors = probe.drawList(view.state.doc.resolve(from).before(1)).map((op) => (op as { color?: string }).color ?? '');
				view.setProps({ decorations: undefined });
				return colors.filter(Boolean);
			},
			id
		);
		for (const want of expected[id])
			if (!drawn.some((color) => sameColor(parsedColor(color), want)))
				missing.push(`${id}: rgba(${want.map((v) => +v.toFixed(2)).join(', ')}) not drawn (drew ${[...new Set(drawn)].join(' | ')})`);
	}
	expect(missing).toEqual([]);
	expect(await probeErrors(visual.page)).toEqual([]);
});
