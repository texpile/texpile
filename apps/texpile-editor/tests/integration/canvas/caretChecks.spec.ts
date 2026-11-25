// the spike's fifteen caret checks (gpui-port/canvas-editor/checks/jobs.mjs in texpile-tools) on the canvas core,
// read through the probe on the spike's caret fixture
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { useTexpile } from '../driver/useTexpile';
import { VisualEditor } from '../driver/visualEditor';
import { inCanvas, probeErrors, settled } from './canvasPage';

const FIXTURE = 'caret.tex';
const sections = Array.from(
	{ length: 25 },
	(_, i) => `\\section{Part ${i}}\n\n${`Words of part ${i} that wrap over the column. `.repeat(8)}`
);
const TITLED = `\\documentclass{article}\n\\title{T}\n\\begin{document}\n\\maketitle\n\n${sections.join('\n\n')}\n\\end{document}\n`;
const texpile = useTexpile({
	files: { [FIXTURE]: fs.readFileSync(path.join(import.meta.dirname, 'caretChecks.tex'), 'utf8'), 'titled.tex': TITLED }
});

type SelectionJson = { type: string; anchor?: number; head?: number; pos?: number };
type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };
/** what the caret layer and the selection painter drew, counted the way the spike's checks counted them */
type Drawn = { carets: number; gaps: number; nodes: number; selection: number; focused: boolean; caret: Rect | null };

function page(): Page {
	return texpile().page;
}

function posOf(needle: string): Promise<number> {
	return inCanvas(page(), ({ probe }, text) => probe.posOf(text), needle);
}

function selection(): Promise<SelectionJson> {
	return inCanvas(page(), ({ view }) => view.state.selection.toJSON() as SelectionJson);
}

/** the text of the top-level block holding `needle` */
function blockText(needle: string): Promise<string | null> {
	return inCanvas(
		page(),
		({ view }, text) => {
			let found: string | null = null;
			view.state.doc.forEach((node) => {
				if (found === null && node.textContent.includes(text)) found = node.textContent;
			});
			return found;
		},
		needle
	);
}

function blockCount(): Promise<number> {
	return inCanvas(page(), ({ view }) => view.state.doc.childCount);
}

function drawn(): Promise<Drawn> {
	return inCanvas(page(), ({ probe, view }) => {
		const carets = probe.carets();
		const own = carets.filter((caret) => caret.kind === 'local' || caret.kind === 'blur');
		const rect = own[0]?.rect ?? null;
		return {
			carets: own.length,
			gaps: carets.filter((caret) => caret.kind === 'gap').length,
			// a formula wears its own selected class (the live field's frame)
			nodes: probe.query('.ProseMirror-selectednode, .math-selected').length,
			selection: probe.selectionRects().length,
			focused: view.hasFocus(),
			caret: rect && { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
		};
	});
}

async function select(anchor: number, head = anchor): Promise<void> {
	await inCanvas(
		page(),
		({ probe, view }, [from, to]) => {
			probe.select(from, to);
			view.focus();
		},
		[anchor, head] as const
	);
	await settled(page());
}

async function press(key: string, times = 1): Promise<void> {
	for (let i = 0; i < times; i++) await page().keyboard.press(key);
	await settled(page());
}

async function type(text: string): Promise<void> {
	await page().keyboard.type(text);
	await settled(page());
}

test.beforeAll(async () => {
	await new VisualEditor(texpile().page, texpile().root).open(FIXTURE);
	await settled(page());
});

test.afterEach(async () => {
	expect(await probeErrors(page())).toEqual([]);
});

test('typing, undo and redo', async () => {
	await select(await posOf('formula'));
	await type('new ');
	expect(await blockText('Before the')).toContain('the new formula');
	await press('ControlOrMeta+z');
	const undone = await blockText('Before the');
	expect(undone, 'one undo, typing grouped').toContain('the formula');
	expect(undone).not.toContain('new');
	await press('ControlOrMeta+Shift+z');
	expect(await blockText('Before the')).toContain('the new formula');
	await press('ControlOrMeta+z');
});

test('input method composition', async () => {
	await select(await posOf('formula'));
	const cdp = await page().context().newCDPSession(page());
	await cdp.send('Input.imeSetComposition', { text: 'n', selectionStart: 1, selectionEnd: 1 });
	await cdp.send('Input.imeSetComposition', { text: 'ni', selectionStart: 2, selectionEnd: 2 });
	await settled(page());
	expect(await blockText('Before the'), 'while composing').toContain('the niformula');
	await cdp.send('Input.insertText', { text: '你' });
	await settled(page());
	expect(await blockText('Before the'), 'after commit').toContain('the 你formula');
	await press('ControlOrMeta+z');
	expect(await blockText('Before the'), 'one undo removes the committed text').toContain('the formula');
	await cdp.detach();
});

test('Enter and Backspace across blocks', async () => {
	const before = await blockCount();
	await select(await posOf('then a reference'));
	await press('Enter');
	expect(await blockCount()).toBe(before + 1);
	await press('Backspace');
	expect(await blockCount()).toBe(before);
	await select(await posOf('ormula we'));
	await press('Backspace');
	await press('Delete');
	const deleted = await blockText('Before the');
	await press('ControlOrMeta+z');
	expect(deleted, 'Backspace and Delete in text').toContain('the rmula we');
});

test('text selection over drawn blocks', async () => {
	const from = (await posOf('Before the formula')) + 3;
	const to = await posOf('two formulas there');
	await select(from, to);
	await press('Shift+ArrowRight', 3);
	expect(await selection(), 'Shift+Right extends').toMatchObject({ anchor: from, head: to + 3 });
	const shown = await drawn();
	expect(shown.selection).toBeGreaterThanOrEqual(4);
	expect(shown.carets).toBe(0);
});

test('Down onto a formula selects it whole', async () => {
	await select(await posOf('more words after it'));
	for (let i = 0; i < 6 && (await selection()).type === 'text'; i++) await press('ArrowDown');
	expect((await selection()).type).toBe('node');
	expect(await drawn(), 'one outline and no caret').toMatchObject({ carets: 0, gaps: 0, nodes: 1 });
});

test('gap cursor between two formulas', async () => {
	await select(await posOf('more words after it'));
	for (let i = 0; i < 6 && (await selection()).type === 'text'; i++) await press('ArrowDown');
	await press('ArrowRight');
	const first = await selection();
	expect(first.type, 'Right from the formula').toBe('gapcursor');
	expect(await drawn(), 'one gap bar only').toMatchObject({ gaps: 1, carets: 0, nodes: 0 });
	await press('ArrowRight');
	expect((await selection()).type).toBe('node');
	await press('ArrowLeft');
	expect(await selection(), 'Right then Left comes back to the gap').toEqual(first);
	const blocks = await blockCount();
	await type('x');
	expect((await selection()).type, 'typing at the gap').toBe('text');
	expect(await blockCount()).toBe(blocks + 1);
	await press('ControlOrMeta+z');
	expect(await blockCount(), 'undo removed the paragraph').toBe(blocks);
	await press('Backspace');
	expect((await selection()).type, 'Backspace at the gap').toBe('node');
});

test('caret and selection drawn while unfocused', async () => {
	const from = await posOf('bounded monotone');
	await select(from);
	// focus parked in an overlay keeps a blur caret; focus anywhere else draws none (6.4)
	await page().evaluate(() => {
		const field = document.body.appendChild(document.createElement('input'));
		field.setAttribute('data-canvas-overlay', '');
		field.id = 'parked-focus';
		field.focus();
	});
	await settled(page());
	expect(await drawn(), 'blur caret while focus is in an overlay').toMatchObject({ focused: false, carets: 1 });
	await page().evaluate(() => {
		const field = document.getElementById('parked-focus');
		field?.blur();
		field?.remove();
	});
	await settled(page());
	expect(await drawn(), 'no caret with focus away').toMatchObject({ focused: false, carets: 0 });
	await inCanvas(page(), ({ probe }, at) => probe.select(at, at + 16), from);
	await settled(page());
	expect(await drawn(), 'selection while unfocused').toMatchObject({ focused: false, selection: 1 });
	await inCanvas(page(), ({ view }) => view.focus());
});

test('caret at Knuth-Plass line ends', async () => {
	const found = await inCanvas(page(), ({ probe, view }) => {
		let block = -1;
		view.state.doc.forEach((node, offset) => {
			if (block < 0 && node.textContent.startsWith('Characterization')) block = offset;
		});
		const lines = probe.lines(block);
		const k = lines.findIndex((line, i) => i + 1 < lines.length && line.hyphen && line.to === lines[i + 1].from);
		if (k < 0) return null;
		const [upper, lower] = [lines[k], lines[k + 1]];
		return {
			at: lower.from,
			upper: [upper.top, upper.top + upper.height],
			lower: [lower.top, lower.top + lower.height],
			left: probe.rectOfNode(block)?.left ?? 0
		};
	});
	expect(found, 'a hyphen break in the paragraph at this width').not.toBeNull();
	const { at, upper, lower, left } = found!;
	// the caret spans the font box at its place, inside its line box (6.4)
	const onLine = (caret: Rect, [top, bottom]: number[]): boolean => caret.top >= top - 0.5 && caret.bottom <= bottom + 0.5;
	await select(at);
	const start = (await drawn()).caret!;
	expect(onLine(start, lower), 'at the break the caret starts the next line').toBe(true);
	expect(start.left - left).toBeLessThan(2);
	await select(at - 3);
	await press('End');
	expect((await selection()).head, 'End stops at the hyphenated break').toBe(at);
	const end = (await drawn()).caret!;
	expect(onLine(end, upper), 'End stays on the hyphenated line').toBe(true);
	expect(end.left - left).toBeGreaterThan(500);
});

test('caret around inline math', async () => {
	const lead = 'Before the formula we have ';
	const before = (await posOf(lead)) + lead.length;
	const size = await inCanvas(page(), ({ view }, at) => view.state.doc.resolve(at).nodeAfter!.nodeSize, before);
	// an arrow enters the formula at the end it comes from, as the DOM editor entered its field there
	const math = () =>
		inCanvas(page(), ({ probe }) => probe.math.active() && { pos: probe.math.active()!.pos, offset: probe.math.active()!.offset });
	await select(before);
	await press('ArrowRight');
	expect(await math(), 'Right enters the formula at its start').toMatchObject({ pos: before, offset: 0 });
	await press('Escape');
	expect((await selection()).head, 'Escape leaves it with the caret after it').toBe(before + size);
	await press('ArrowLeft');
	expect(await math(), 'Left enters it again').toMatchObject({ pos: before });
	await press('Control+ArrowRight');
	expect((await selection()).head, 'Ctrl+Right at its end leaves after it').toBe(before + size);
	await select(before + size);
	await press('Backspace');
	expect(await math(), 'Backspace after the formula goes into it').toMatchObject({ pos: before });
	await press('Escape');
	await select(before);
	const caret = (await drawn()).caret!;
	await page().mouse.click(caret.left + 8, (caret.top + caret.bottom) / 2);
	await settled(page());
	expect(await selection(), 'a click on the formula selects it').toMatchObject({ type: 'node', anchor: before });
});

test('editable raw LaTeX chip', async () => {
	const before = await inCanvas(page(), ({ view }) => {
		let found = -1;
		view.state.doc.descendants((node, pos) => {
			if (found < 0 && node.type.name === 'inline_latex') found = pos;
			return found < 0;
		});
		return found;
	});
	expect(before, 'an inline_latex chip in the fixture').toBeGreaterThan(0);
	await select(before);
	await press('ArrowRight');
	expect((await selection()).head, 'the caret enters the chip').toBe(before + 1);
	await press('ArrowRight', 7);
	await type('Z');
	expect(await inCanvas(page(), ({ view }, at) => view.state.doc.resolve(at).nodeAfter!.textContent, before)).toBe('\\mycmd{Zraw chip}');
	await press('ArrowRight', 12);
	const after = await posOf(' in the text');
	const head = (await selection()).head!;
	await press('ControlOrMeta+z');
	expect(head, 'Right walks out of the chip').toBeGreaterThan(after);
});

test('comment highlight maps through edits', async () => {
	const from = await posOf('bounded monotone');
	await inCanvas(
		page(),
		({ view }, at) => {
			const plugin = view.state.plugins.find((each) => (each as unknown as { key: string }).key.startsWith('texpile-comments$'))!;
			view.dispatch(view.state.tr.setMeta(plugin, { type: 'set', ranges: [{ id: 'spike', from: at, to: at + 7, resolved: false }] }));
		},
		from
	);
	await select(await posOf('Every'));
	await type('Yes, ');
	const tinted = await inCanvas(page(), ({ probe, view }) => {
		const plugin = view.state.plugins.find((each) => (each as unknown as { key: string }).key.startsWith('texpile-comments$'))!;
		const ranges = (plugin.getState(view.state) as { ranges: { from: number; to: number }[] }).ranges.map((r) => [r.from, r.to]);
		const [start, end] = ranges[0] ?? [0, 0];
		const band = view.canvas.rangeClientRects(start, end, 'text')[0];
		const corner = band && view.canvas.docPoint({ x: band.left + 1, y: band.top + 1 });
		const painted =
			!!corner &&
			probe
				.drawList(start)
				.some(
					(op) =>
						op.op === 'fillRect' &&
						op.rect.x <= corner.x &&
						corner.x <= op.rect.x + op.rect.width &&
						op.rect.y <= corner.y &&
						corner.y <= op.rect.y + op.rect.height
				);
		return { ranges, painted };
	});
	await press('ControlOrMeta+z');
	expect(tinted.ranges[0], 'the comment moved with the typed words').toEqual([from + 5, from + 12]);
	expect(tinted.painted, 'the comment is tinted').toBe(true);
});

test('plain-text copy and paste', async () => {
	const from = await posOf('last paragraph');
	await select(from, from + 'last paragraph'.length);
	await press('ControlOrMeta+c');
	const end = await inCanvas(page(), ({ view }, at) => view.state.doc.resolve(at).end(), from);
	await select(end);
	await press('ControlOrMeta+v');
	expect(await blockText('The last paragraph')).toMatch(/nothing\.last paragraph$/);
	const blocks = await blockCount();
	await page().evaluate(() => {
		const data = new DataTransfer();
		data.setData('text/plain', 'one line\nand a second');
		document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
	});
	await settled(page());
	expect(await blockCount(), 'two lines make one new block').toBe(blocks + 1);
	expect(await inCanvas(page(), ({ view }) => view.state.doc.lastChild!.textContent)).toBe('and a second');
	await press('ControlOrMeta+z');
	await press('ControlOrMeta+z');
});

test('one caret, on screen, walking Down', async () => {
	await select(await posOf('Caret walk'));
	for (let step = 0; step < 40; step++) {
		await press('ArrowDown');
		const shown = await drawn();
		expect(shown.carets + shown.gaps + shown.nodes, `step ${step}: one caret`).toBe(1);
		if (!shown.caret) continue;
		const pane = await inCanvas(page(), ({ view }) => {
			const box = view.canvas.scroller.getBoundingClientRect();
			return { top: box.top, bottom: box.bottom };
		});
		expect(shown.caret.top, `step ${step}: caret below the pane's top`).toBeGreaterThanOrEqual(pane.top);
		expect(shown.caret.bottom, `step ${step}: caret above the pane's bottom`).toBeLessThanOrEqual(pane.bottom);
	}
});

test('Select All is drawn', async () => {
	await select(await posOf('Caret walk'));
	await press('ControlOrMeta+a');
	const all = await selection();
	const size = await inCanvas(page(), ({ view }) => view.state.doc.content.size);
	expect(all.type === 'all' || ((all.anchor ?? 0) <= 1 && (all.head ?? 0) >= size - 1), `Ctrl+A gave ${JSON.stringify(all)}`).toBe(true);
	const shown = await drawn();
	expect(shown.selection).toBeGreaterThanOrEqual(10);
	expect(shown.carets).toBe(0);
	await select(await posOf('Caret walk'));
});

test('mouse: click places the caret, drag selects', async () => {
	const at = await posOf('which the gap cursor');
	await select(at);
	const caret = (await drawn()).caret!;
	const y = (caret.top + caret.bottom) / 2;
	await page().mouse.click(caret.left + 1, y);
	await settled(page());
	const clicked = await selection();
	await page().mouse.move(caret.left + 1, y);
	await page().mouse.down();
	await page().mouse.move(caret.left + 120, y, { steps: 5 });
	await page().mouse.up();
	await settled(page());
	const dragged = await selection();
	expect(Math.abs(clicked.head! - at), `click: ${JSON.stringify(clicked)}`).toBeLessThanOrEqual(1);
	expect(dragged.type).toBe('text');
	expect(dragged.head! - dragged.anchor!, `drag: ${JSON.stringify(dragged)}`).toBeGreaterThan(8);
});

test('Ctrl+Home before a title that takes no caret scrolls to it', async () => {
	await new VisualEditor(page(), texpile().root).open('titled.tex');
	await settled(page());
	await select((await posOf('Words of part 12')) + 3);
	await press('ArrowDown');
	expect(await inCanvas(page(), ({ view }) => view.canvas.scroller.scrollTop)).toBeGreaterThan(1000);
	await press('Control+Home');
	expect(await selection()).toEqual({ type: 'gapcursor', pos: 0 });
	const shown = await inCanvas(page(), ({ probe, view }) => {
		const pane = view.canvas.scroller.getBoundingClientRect();
		const gap = probe.carets().find((caret) => caret.kind === 'gap');
		return { top: view.canvas.scroller.scrollTop, onScreen: !!gap && gap.rect.top >= pane.top && gap.rect.bottom <= pane.bottom };
	});
	expect(shown.top).toBeLessThan(200);
	expect(shown.onScreen, 'the gap cursor is drawn on screen').toBe(true);
});
