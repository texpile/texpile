// the hit grid of P0's recording of the DOM editor (18.3): at each recorded scroll position the canvas answers every 20 px
// cell of the pane with P0's position or one whose caret stands within 1 px of it. Every other cell is held to this canvas's
// own layout: the hit caret is on the line nearest the click and the nearest caret to it on that line, within 1 px.
// Counts per document are printed as HITSUM and must repeat between runs
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { useTexpile } from '../driver/useTexpile';
import { VisualEditor } from '../driver/visualEditor';
import { inCanvas, picturesSettled } from './canvasPage';
import { decidedCell, judgeAnswer, linesOf, SAME_PX, type CaretRect, type CellAnswer } from './hitParityOracle';

type CaretRow = [number, number, number, number, number, number, number, number, number];
type ParityScreen = {
	env: { scrollIndex: number; blocks: number };
	pane: { left: number; top: number; width: number; height: number };
	cols: number;
	rows: number;
	pmPos: (number | null)[];
	carets: CaretRow[];
};
type DocumentCase = { fixture: string; folder: string; file: string };

/** a block's offsets summed in another order differ in the last bits: a thousandth of a px tells two answers apart */
function answersKey(answers: unknown): string {
	return JSON.stringify(answers, (_, value) => (typeof value === 'number' ? Math.round(value * 1000) / 1000 : value));
}

const GEOMETRY = path.resolve(import.meta.dirname, '../../fixtures/parity/geometry');
const DOCS = process.env.TEXPILE_PARITY_DOCS ?? '/home/user/texpile-tools/perf-drive/work/docs';
const POSITIONS = [0, 1, 2, 3, 4];

const DOCUMENTS: DocumentCase[] = [
	{ fixture: 'parity-tex-tables__main_tex', folder: 'parity-tex-tables', file: 'main.tex' },
	{ fixture: 'parity-tex-theorems__main_tex', folder: 'parity-tex-theorems', file: 'main.tex' },
	{ fixture: 'parity-tex-article__main_tex', folder: 'parity-tex-article', file: 'main.tex' },
	{ fixture: 'parity-md-root__feature-sweep_md', folder: 'parity-md-root', file: 'feature-sweep.md' },
	{ fixture: 'parity-typ-typst-paper__main_typ', folder: 'parity-typ-typst-paper', file: 'main.typ' },
	{ fixture: 'parity-typ-typst-report__chapters_method_typ', folder: 'parity-typ-typst-report', file: 'chapters/method.typ' }
];

const files = Object.fromEntries(
	DOCUMENTS.filter((entry) => fs.existsSync(path.join(DOCS, entry.folder, entry.file))).map((entry) => [
		`${entry.folder}/${entry.file}`,
		fs.readFileSync(path.join(DOCS, entry.folder, entry.file), 'utf8')
	])
);
const texpile = useTexpile({ files });

function screenOf(fixture: string, position: number): ParityScreen {
	return JSON.parse(fs.readFileSync(path.join(GEOMETRY, `${fixture}@p${position}.json`), 'utf8')) as ParityScreen;
}

/** the caret rect P0 recorded for `pos`, pane-relative: left, top of the trailing side */
function recordedCaret(screen: ParityScreen, pos: number): [number, number, number] | null {
	const row = screen.carets.find((caret) => caret[0] === pos);
	return row ? [row[5], row[7], row[8] - row[7]] : null;
}

type Measured = { answers: CellAnswer[]; carets: CaretRect[]; beside: (number | null)[][] };

/** every block laid out once, so the heights a scroll depends on are final whatever the order the positions run in */
function layOutEveryBlock(page: Page): Promise<void> {
	return inCanvas(page, async ({ view, probe }) => {
		const offsets: number[] = [];
		view.state.doc.forEach((_node, offset) => offsets.push(offset));
		for (const offset of offsets) probe.rectOfNode(offset);
		await probe.settle();
		view.canvas.scroller.scrollTop = 0;
		await probe.settle();
	});
}

/** every cell answered over the recorded pane at scroll position `position`, in the recorded pane's coordinates */
function measureScreen(page: Page, screen: ParityScreen): Promise<Measured> {
	return inCanvas(
		page,
		async ({ view, probe }, { recorded, cols, rows, block }) => {
			const scroller = view.canvas.scroller;
			const paneOf = () => {
				const box = scroller.getBoundingClientRect();
				return {
					left: box.left + scroller.clientLeft,
					top: box.top + scroller.clientTop,
					width: scroller.clientWidth,
					height: scroller.clientHeight
				};
			};
			const blocks: number[] = [];
			view.state.doc.forEach((_node, offset) => blocks.push(offset));
			const at = blocks[Math.min(blocks.length - 1, block)];
			// block heights below a scroll are estimates until laid out: scroll until the block holds its place
			for (let round = 0; round < 8; round++) {
				await probe.settle();
				const delta = probe.rectOfNode(at)!.top - paneOf().top - 8;
				if (Math.abs(delta) < 0.5) break;
				scroller.scrollTop += delta;
			}
			await probe.settle();
			const pane = paneOf();
			// the column is centered: its offset from P0's pane is the difference of the pane centers
			const dx = pane.left + pane.width / 2 - (recorded.left + recorded.width / 2);
			const dy = pane.top - recorded.top;
			const island = (pos: number) => {
				const parent = view.state.doc.resolve(pos).parent;
				return parent.type.spec.code || /^(raw_|code)/.test(parent.type.name) ? parent : null;
			};
			const rectAt = (pos: number, side = 1) => {
				const caret = view.coordsAtPos(pos, side);
				return { left: caret.left - dx, top: caret.top - dy, bottom: caret.bottom - dy };
			};
			const chainOf = (pos: number) => {
				const $pos = view.state.doc.resolve(pos);
				return Array.from({ length: $pos.depth + 1 }, (_unused, depth) => $pos.node(depth).type.name)
					.slice(-3)
					.join('>');
			};
			// the textblock around a position, also from inside an inline node that holds text
			const textblockOf = (pos: number) => {
				const $pos = view.state.doc.resolve(pos);
				for (let depth = $pos.depth; depth > 0; depth--)
					if ($pos.node(depth).isTextblock) return { type: $pos.node(depth).type.name, start: $pos.start(depth), end: $pos.end(depth) };
				return null;
			};
			const boundaryAt = (pos: number) => {
				const $pos = view.state.doc.resolve(pos);
				const spans = [$pos.nodeBefore && pos - $pos.nodeBefore.nodeSize, $pos.nodeAfter && pos]
					.filter((offset): offset is number => offset !== null && offset !== undefined)
					.map((offset) => probe.rectOfNode(offset))
					.filter((rect): rect is DOMRect => !!rect);
				return spans.length
					? { top: Math.min(...spans.map((rect) => rect.top)) - dy, bottom: Math.max(...spans.map((rect) => rect.bottom)) - dy }
					: null;
			};
			const blockAt = (pos: number) => {
				const $pos = view.state.doc.resolve(pos);
				const rect = probe.rectOfNode($pos.depth ? $pos.before(1) : pos);
				return rect ? { top: rect.top - dy, bottom: rect.bottom - dy } : null;
			};
			const answers: CellAnswer[] = [];
			const beside: (number | null)[][] = [];
			for (let row = 0; row < rows; row++)
				for (let col = 0; col < cols; col++) {
					const click = { x: recorded.left + col * 20 + 10, y: recorded.top + row * 20 + 10 };
					const point = { left: click.x + dx, top: click.y + dy };
					const found = view.posAtCoords(point);
					const placed = view.canvas.geometry.hit(view.canvas.docPoint({ x: point.left, y: point.top }));
					// at a soft line end the answer's caret is the upstream one
					const side = found && placed?.caret.pos === found.pos ? placed.caret.affinity : 1;
					const holder = found ? textblockOf(found.pos) : null;
					answers.push({
						click,
						pos: found?.pos ?? null,
						rect: found ? { pos: found.pos, ...rectAt(found.pos, side), textblock: holder?.start ?? -1, chain: chainOf(found.pos) } : null,
						textblock: holder && { ...holder, firstTop: rectAt(holder.start).top },
						inIsland: !!found && island(found.pos) !== null,
						boundary: found && !holder ? boundaryAt(found.pos) : null,
						block: found ? blockAt(found.pos) : null
					});
					// the same answer a pixel to any side, which P0's cell rounding may have taken
					beside.push(
						[
							[-1, 0],
							[1, 0],
							[0, -1],
							[0, 1]
						].map(([sx, sy]) => view.posAtCoords({ left: point.left + sx, top: point.top + sy })?.pos ?? null)
					);
				}
			// every caret of the blocks near the pane, from both sides of a soft line end: what a click is judged against
			const carets: CaretRect[] = [];
			blocks.forEach((offset, index) => {
				const rect = probe.rectOfNode(offset);
				if (!rect || rect.bottom < pane.top - 200 || rect.top > pane.top + pane.height + 200) return;
				view.state.doc.nodesBetween(offset, offset + view.state.doc.child(index).nodeSize, (child, pos) => {
					if (!child.isTextblock) return true;
					for (let place = pos + 1; place <= pos + 1 + child.content.size; place++) {
						// a hidden caption has no caret to answer, only its node's box as a fallback rect
						if (!view.canvas.geometry.caretRect({ pos: place, affinity: 1 })) continue;
						const downstream = { pos: place, ...rectAt(place), textblock: pos + 1, chain: chainOf(place) };
						const upstream = { ...downstream, ...rectAt(place, -1) };
						carets.push(downstream);
						if (Math.abs(upstream.top - downstream.top) > 0.5) carets.push(upstream);
					}
					return false;
				});
			});
			return { answers, carets, beside };
		},
		{
			recorded: screen.pane,
			cols: screen.cols,
			rows: screen.rows,
			block: Math.min(screen.env.blocks - 1, Math.floor(screen.env.scrollIndex))
		}
	);
}

const KINDS = [
	'sameAsP0',
	'sameCaretAsP0',
	'aboveFirstLine',
	'rightOfHeading',
	'betweenNodes',
	'codeIsland',
	'p0Null',
	'ownLayout'
] as const;
type Kind = (typeof KINDS)[number];

for (const parityDoc of DOCUMENTS) {
	test(`${parityDoc.fixture}: every cell of P0's hit grids is P0's answer or the nearest caret on this layout`, async () => {
		test.setTimeout(480_000);
		const name = `${parityDoc.folder}/${parityDoc.file}`;
		test.skip(!(name in files), `no ${name}`);
		const { page, root } = texpile();
		const visual = new VisualEditor(page, root);
		await visual.open(name);
		await page.waitForFunction(() => [...document.images].every((image) => image.complete));
		await picturesSettled(page);
		await page.evaluate(() => document.fonts.ready.then(() => undefined));
		texpile().takeErrors();
		await layOutEveryBlock(page);
		const counts = Object.fromEntries(KINDS.map((kind) => [kind, 0])) as Record<Kind, number>;
		const failures: string[] = [];
		let compared = 0;
		let firstAnswers = '';
		for (const position of POSITIONS) {
			const screen = screenOf(parityDoc.fixture, position);
			const { answers, carets, beside } = await measureScreen(page, screen);
			firstAnswers ||= answersKey(answers);
			const lines = linesOf(carets);
			screen.pmPos.forEach((want, cell) => {
				const answer = answers[cell];
				compared++;
				const wantAt = want === null ? null : recordedCaret(screen, want);
				const sameCaret =
					!!wantAt &&
					!!answer.rect &&
					Math.abs(answer.rect.left - wantAt[0]) <= SAME_PX &&
					Math.abs(answer.rect.top - wantAt[1]) <= SAME_PX;
				if (want === answer.pos) return void counts.sameAsP0++;
				if (beside[cell].includes(want) || sameCaret) return void counts.sameCaretAsP0++;
				const verdict = judgeAnswer(answer, lines);
				const decided = decidedCell(answer);
				// P0 took the same textblock (a click over a figure's picture, into its caption): only where on its line is decided
				const sameTextblock = !!answer.textblock && want !== null && want >= answer.textblock.start && want <= answer.textblock.end;
				if (!verdict.ok && !(sameTextblock && decided))
					failures.push(
						`p${position} cell (${cell % screen.cols},${Math.floor(cell / screen.cols)}): want ${want}, got ${answer.pos}: ${verdict.why}`
					);
				if (want === null) counts.p0Null++;
				else if (decided) counts[decided]++;
				else if (answer.boundary) counts.betweenNodes++;
				else if (answer.inIsland) counts.codeIsland++;
				else counts.ownLayout++;
			});
		}
		// the first screen again after the others: a layout that settles late or by scroll order answers differently
		const again = await measureScreen(page, screenOf(parityDoc.fixture, POSITIONS[0]));
		expect(answersKey(again.answers), 'the same screen answers the same after scrolling elsewhere and back').toBe(firstAnswers);
		console.log(`HITSUM ${parityDoc.fixture} ${compared} ${JSON.stringify(counts)} failures ${failures.length}`);
		expect(compared).toBeGreaterThan(0);
		expect(failures.length, `answers off the nearest caret of this layout:\n${failures.slice(0, 12).join('\n')}`).toBe(0);
	});
}
