// P0's MathLive caret outcomes (tests/fixtures/parity/math/README.md) replayed on the canvas's formula session
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import type { CanvasProbe, ProbeMathSession } from '$lib/editor/canvas';

/** [offset, selStart, selEnd, direction, caretX, caretY, caretHeight, selectionRects?] or an exit */
export type RecordedState = [number, number, number, string, number | null, number | null, number | null, number[][]?];
export type RecordedOutcome = RecordedState | ['out', ...unknown[]];

export type MathFixture = {
	id: string;
	formula: {
		pos: number;
		type: 'inline_math' | 'block_math';
		source: string;
		document: { folder: string; file: string };
		/** [x, y, width, height] before entry, client px */
		staticBox: [number, number, number, number];
	};
	contentDelta: [number, number];
	contentInStatic: [number, number];
	lastOffset: number;
	clickEntry: { at: [number, number]; state: RecordedOutcome }[];
	entries: { arrowFromBefore: { key: string; state: RecordedOutcome } | null; arrowFromAfter: { key: string; state: RecordedOutcome } };
	/** HomeEnd holds [key, start offset, outcome] */
	sequences: Record<string, RecordedOutcome[]>;
	vertical: Record<'Up' | 'Down' | 'ShiftUp' | 'ShiftDown', [number, RecordedOutcome][]>;
	grid: { step: number; x0: number; y0: number; cols: number; rows: number; cells: (RecordedOutcome | null)[] };
};

/** the session as the replay reads it: client px; `caret` is the bar the canvas paints */
export type SessionState = Pick<ProbeMathSession, 'pos' | 'offset' | 'ranges' | 'caretBox'> & {
	caret: { x: number; y: number; height: number } | null;
	formula: { x: number; y: number; width: number; height: number };
	/** a macro call's chip panel is open */
	panel: boolean;
};

export const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/parity/math');

export function mathFixtures(): MathFixture[] {
	return fs
		.readdirSync(FIXTURES)
		.filter((name) => name.endsWith('.json'))
		.map((name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8')) as MathFixture);
}

const SEQUENCE_KEYS: Record<string, string> = {
	RightFromStart: 'ArrowRight',
	LeftFromEnd: 'ArrowLeft',
	ShiftRightFromStart: 'Shift+ArrowRight',
	ShiftLeftFromEnd: 'Shift+ArrowLeft',
	ShiftRightFromMid: 'Shift+ArrowRight',
	ShiftLeftFromMid: 'Shift+ArrowLeft'
};

// the live field's content padding, which the canvas does not draw (README, units): a display's glyphs start 1 px in, 2 down
const DISPLAY_PADDING: [number, number] = [1, 2];
const CARET_SLACK = 1;
/** the bar MathLive drew in its .ML__caret span (mathfield.less), in em of the span's font: the span is 1.2em tall with
 * its baseline .935em down, the bar .76em tall from .05em under that baseline and .045em left of the span */
const CARET_BAR = { spanHeight: 1.2, top: 0.935 + 0.05 - 0.76, left: 0.045, height: 0.76 };

function recordedBarOf(x: number, y: number, height: number): [number, number, number] {
	const em = height / CARET_BAR.spanHeight;
	return [x - CARET_BAR.left * em, y + CARET_BAR.top * em, CARET_BAR.height * em];
}
// decision rows: Left and Right take a call of the paper's own macros whole in a sub or superscript too (canvas
// decisions README, "Left and Right take every own macro call whole, in scripts too"); P0 stepped over those calls
const WHOLE_CALL_ROWS = new Set(['pp-display-cases', 'pp-display-big-brackets-frac', 'pp-inline-overline']);

export class MathCaretReplay {
	readonly misses: string[] = [];
	/** geometry rows of a restyled inline formula that land elsewhere: the text style moved its atoms (A11) */
	readonly decisionRows: string[] = [];
	compared = 0;
	/** an inline formula text style redraws (A11): its geometry rows are decision rows, its offsets still compare */
	restyled = false;
	private readonly pad: [number, number];

	constructor(
		private readonly page: Page,
		private readonly fixture: MathFixture,
		/** the formula node's position on the canvas */
		private readonly pos: number,
		private readonly end: number
	) {
		this.pad = fixture.formula.type === 'block_math' ? DISPLAY_PADDING : [0, 0];
	}

	state(): Promise<SessionState | null> {
		return this.page.evaluate(() => {
			const session = (window as unknown as { __canvasProbe: CanvasProbe }).__canvasProbe.active()?.math.active();
			if (!session) return null;
			const { x, y, width, height } = session.formula;
			const panel = !!document.querySelector('.drawn-chip-panel');
			const caret = session.caret && { x: session.caret.x, y: session.caret.y, height: session.caret.height };
			const { pos, offset, ranges, caretBox } = session;
			return { pos, offset, ranges, caretBox, caret, formula: { x, y, width, height }, panel };
		});
	}

	/** the formula holds still: a long paper's idle layout moves what is on screen for a while after it opens */
	private async waitStill(): Promise<void> {
		let last = '';
		for (let i = 0; i < 100; i++) {
			const now = await this.blockPlace();
			if (now === last) return;
			last = now;
			await this.page.waitForTimeout(400);
		}
	}

	/** the caret before the formula, then the key P0 entered with */
	async enter(): Promise<SessionState | null> {
		const entry = this.fixture.entries.arrowFromBefore ?? this.fixture.entries.arrowFromAfter;
		const at = entry === this.fixture.entries.arrowFromBefore ? this.pos : this.end;
		await this.page.evaluate((at) => (window as unknown as { __canvasProbe: CanvasProbe }).__canvasProbe.active()!.select(at), at);
		await this.page.keyboard.press(entry.key);
		await this.waitStill();
		// the caret's reveal can scroll the pane a frame later, under a press about to be aimed
		await this.page.evaluate(() => (window as unknown as { __canvasProbe: CanvasProbe }).__canvasProbe.active()!.settle());
		const { formula } = this.fixture;
		if (formula.type === 'inline_math') this.restyled = await this.textStyleMoves(formula.source, formula.document.file.endsWith('.typ'));
		return this.state();
	}

	/** the formula drawn in text style differs from display style, the size P0 drew every formula at */
	private textStyleMoves(source: string, typst: boolean): Promise<boolean> {
		return this.page.evaluate(
			async ({ source, typst }) => {
				const cache = await import(/* @vite-ignore */ '/src/lib/editor/canvas/math/mathLayoutCache.ts' as string);
				const layouts = cache.windowFormulaLayouts();
				const look = (display: boolean) => {
					const { width, ascent, descent, items } = layouts.layout({ syntax: typst ? 'typst' : 'latex', source, display }, 'serif');
					return JSON.stringify({ width, ascent, descent, items });
				};
				return look(false) !== look(true);
			},
			{ source, typst }
		);
	}

	private async ensureEntered(): Promise<void> {
		if ((await this.state())?.pos !== this.pos) await this.enter();
	}

	private async setOffset(offset: number): Promise<void> {
		await this.ensureEntered();
		await this.page.evaluate(
			(offset) => (window as unknown as { __canvasProbe: CanvasProbe }).__canvasProbe.active()!.math.select([[offset, offset]]),
			offset
		);
	}

	/** recorded caret coordinates are from the live box's top-left; the canvas's from its drawn formula */
	private liveBoxOf(got: SessionState, rect: { x: number; y: number; height: number } | null): [number, number, number] | null {
		if (!rect) return null;
		const [dx, dy] = this.fixture.contentDelta;
		return [rect.x - got.formula.x + dx + this.pad[0], rect.y - got.formula.y + dy + this.pad[1], rect.height];
	}

	private miss(label: string, row: string): void {
		const geometry = /^(Up|Down|grid|click)/.test(label);
		(this.restyled && geometry ? this.decisionRows : this.misses).push(row);
	}

	private compareCaret(label: string, what: string, want: [number, number, number], got: [number, number, number] | null): void {
		const off = got && [got[0] - want[0], got[1] - want[1], got[2] - want[2]].some((d) => Math.abs(d) > CARET_SLACK);
		if (!got || off) this.misses.push(`${label}: P0 ${what} ${want.map((v) => v.toFixed(2))}, canvas ${got?.map((v) => v.toFixed(2))}`);
	}

	check(label: string, expected: RecordedOutcome, got: SessionState | null, rects = true): void {
		this.compared++;
		if (expected[0] === 'out') {
			// a press on a call of the paper's own macros opens its chip panel: the live field gave the panel the focus;
			// Up or Down onto a display beside it enters that one (decision rows, A5)
			if (got && !got.panel && got.pos === this.pos) this.miss(label, `${label}: P0 left the formula, the canvas kept it at ${got.offset}`);
			return;
		}
		const [offset, from, to, , x, y, height] = expected as RecordedState;
		if (!got) {
			this.miss(label, `${label}: P0 ${offset}, the canvas left the formula`);
			return;
		}
		const [gotFrom, gotTo] = got.ranges[0];
		if (got.offset !== offset || gotFrom !== from || gotTo !== to) {
			this.miss(label, `${label}: P0 ${offset} [${from}, ${to}], canvas ${got.offset} [${gotFrom}, ${gotTo}]`);
			return;
		}
		if (!rects || this.restyled || x === null || y === null || height === null) return;
		const box = got.caretBox && { x: got.caretBox.x, y: got.caretBox.top, height: got.caretBox.height };
		this.compareCaret(label, 'caret span', [x, y, height], this.liveBoxOf(got, box));
		this.compareCaret(label, 'caret bar', recordedBarOf(x, y, height), this.liveBoxOf(got, got.caret));
	}

	async sequences(): Promise<void> {
		for (const [name, steps] of Object.entries(this.fixture.sequences)) {
			const key = SEQUENCE_KEYS[name];
			if (!key || WHOLE_CALL_ROWS.has(this.fixture.id)) continue;
			const start = steps[0] as RecordedState;
			await this.setOffset(start[0]);
			this.check(`${name}[0]`, start, await this.state());
			for (let i = 1; i < steps.length && steps[i][0] !== 'out'; i++) {
				await this.page.keyboard.press(key);
				this.check(`${name}[${i}]`, steps[i], await this.state());
			}
		}
		const homeEnd = (this.fixture.sequences.HomeEnd ?? []) as unknown as [string, number, RecordedOutcome][];
		for (const [key, start, expected] of homeEnd) {
			await this.setOffset(start);
			await this.page.keyboard.press(key);
			this.check(`${key}@${start}`, expected, await this.state());
		}
	}

	async vertical(): Promise<void> {
		for (const dir of ['Up', 'Down', 'ShiftUp', 'ShiftDown'] as const) {
			const key = dir.startsWith('Shift') ? `Shift+Arrow${dir.slice(5)}` : `Arrow${dir}`;
			for (const [offset, expected] of this.fixture.vertical[dir]) {
				await this.setOffset(offset);
				await this.page.keyboard.press(key);
				this.check(`${dir}@${offset}`, expected, await this.state());
			}
		}
	}

	/** every `stride`-th grid point inside the drawn formula, skipping points on a boundary: P0's nearest recorded
	 * neighbors on either side or above and below differ from it, where atom boxes a pixel apart decide */
	async grid(stride: number): Promise<void> {
		const { grid, contentDelta } = this.fixture;
		const cell = (i: number, j: number) => (i < 0 || j < 0 || i >= grid.cols || j >= grid.rows ? null : grid.cells[j * grid.cols + i]);
		const neighbor = (i: number, j: number, di: number, dj: number) => {
			for (let k = 1; k <= 3; k++) {
				const found = cell(i + di * k, j + dj * k);
				if (found) return found;
			}
			return null;
		};
		const same = (a: RecordedOutcome | null, b: RecordedOutcome) => !a || JSON.stringify(a.slice(0, 3)) === JSON.stringify(b.slice(0, 3));
		for (let j = 0; j < grid.rows; j++)
			for (let i = 0; i < grid.cols; i++) {
				const expected = cell(i, j);
				if ((j * grid.cols + i) % stride || !expected) continue;
				const around = [neighbor(i, j, -1, 0), neighbor(i, j, 1, 0), neighbor(i, j, 0, -1), neighbor(i, j, 0, 1)];
				if (!around.every((other) => same(other, expected))) continue;
				const inside = (formula: SessionState['formula'], x: number, y: number) =>
					x >= formula.x + 1 && x <= formula.x + formula.width - 1 && y >= formula.y + 1 && y <= formula.y + formula.height - 1;
				let skipped = false;
				const got = await this.pressStill(async () => {
					await this.ensureEntered();
					const formula = (await this.state())?.formula;
					if (!formula) return null;
					const [x, y] = this.drawnPoint(formula, grid.x0 + grid.step * i - contentDelta[0], grid.y0 + grid.step * j - contentDelta[1]);
					// the live field's border and padding are gone (D23): points outside the drawn formula decided nothing
					skipped = !inside(formula, x, y);
					return skipped ? null : [x, y];
				});
				if (skipped) continue;
				this.check(`grid ${i},${j}`, expected, got, false);
				if (got?.panel) await this.page.keyboard.press('Escape');
			}
	}

	/** a point of P0's live box in the canvas's drawn formula: the same spot of a formula drawn at P0's size, else the same share of its size (A11) */
	private drawnPoint(formula: SessionState['formula'], px: number, py: number): [number, number] {
		if (!this.restyled) return [formula.x + px - this.pad[0], formula.y + py - this.pad[1]];
		const [, , width, height] = this.fixture.formula.staticBox;
		return [formula.x + (px / width) * formula.width, formula.y + (py / height) * formula.height];
	}

	/** where the formula's block is on screen now */
	private blockPlace(): Promise<string> {
		return this.page.evaluate((pos) => {
			const rect = (window as unknown as { __canvasProbe: CanvasProbe }).__canvasProbe.active()!.rectOfNode(pos);
			return rect ? [rect.left, rect.top, rect.width].map((v) => v.toFixed(2)).join() : '';
		}, this.pos);
	}

	/** a press at the point `aim` gives, aimed again while the pane's idle layout moves the formula under it (the
	 * 703 KB paper's first minutes) */
	private async pressStill(aim: () => Promise<[number, number] | null>): Promise<SessionState | null> {
		for (let attempt = 0; ; attempt++) {
			const point = await aim();
			if (!point) return null;
			const before = await this.blockPlace();
			await this.page.mouse.click(...point);
			const got = await this.state();
			if (attempt === 2 || (await this.blockPlace()) === before) return got;
			if (got?.panel) await this.page.keyboard.press('Escape');
			// past the 500 ms repeat-click window, or the retry on the same point is a double click
			await this.page.waitForTimeout(550);
		}
	}

	/** the outcome P0 recorded, at the point or a pixel from it, each a fresh first click on the formula */
	private async reachedWithin(expected: RecordedOutcome, x: number, y: number): Promise<boolean> {
		const matches = (got: SessionState | null) =>
			!!got && expected[0] !== 'out' && got.offset === expected[0] && got.ranges[0][0] === expected[1] && got.ranges[0][1] === expected[2];
		if (matches(await this.state())) return true;
		for (const [dx, dy] of [
			[-1, 0],
			[1, 0],
			[0, -1],
			[0, 1]
		]) {
			await this.page.keyboard.press('Escape');
			await this.page.waitForTimeout(600);
			await this.page.mouse.click(x + dx, y + dy);
			if (matches(await this.state())) return true;
		}
		return false;
	}

	/** the click P0 made on the formula before it was entered; the drawn formula stays where the session found it (D23) */
	async clickEntry(): Promise<void> {
		const { contentInStatic } = this.fixture;
		for (const { at, state } of this.fixture.clickEntry) {
			const aimed: { point: [number, number] | null } = { point: null };
			await this.pressStill(async () => {
				await this.ensureEntered();
				const formula = (await this.state())?.formula;
				await this.page.keyboard.press('Escape');
				if (!formula) return null;
				// a press soon after the last one would count as its second click
				await this.page.waitForTimeout(600);
				aimed.point = this.drawnPoint(formula, at[0] - contentInStatic[0], at[1] - contentInStatic[1]);
				return aimed.point;
			});
			if (!aimed.point) continue;
			const [x, y] = aimed.point;
			// the box center can sit on a boundary between atoms whose boxes are a pixel apart: P0's outcome within 1 px
			if (!(await this.reachedWithin(state, x, y))) this.check(`click entry ${at}`, state, await this.state(), false);
			else this.compared++;
		}
	}
}
