// one frame per change (0.3): lay out the shown rows' blocks, keep the reading place, reveal, paint what changed (2.5, 6.6)
import type { FrameDecorations } from '../contracts/decorationTypes';
import type { CanvasPainter, PaintFrame, PlacedBlock, ViewStyles } from '../contracts/engineTypes';
import type { CanvasGeometry, CaretPlace } from '../contracts/geometryTypes';
import type { DocRect } from '../contracts/layoutTypes';
import type { VisualView } from '../contracts/viewTypes';
import { collectDecorations } from '../decorations/collectDecorations';
import type { BlockIndex } from '../document/blockIndex';
import { IdleHeights } from '../document/idleHeights';
import { ScrollAnchor } from '../document/scrollAnchor';
import type { ViewDocument } from '../document/viewDocument';
import type { WidthHold } from '../document/widthHold';
import type { RevealPolicy } from '../view/reveal';
import type { BlockFailures } from './blockFailures';
import { FrameStats } from './frameStats';
import { listenToPane } from './paneListeners';
import { PaneShownMark } from './paneShownMark';
import { idleSchedulerOf, type IdleScheduler } from './idleScheduler';
import { readinessOf, viewReadyGate, type ReadyGate } from './readyGate';
import { rootSheetRect } from './rootBox';
import type { CanvasSurface } from './surface';
import { QuietTimers } from './quietTimers';
import { TilePaint } from './tiles/tilePaint';

export type FrameParts = {
	readonly view: VisualView;
	readonly surface: CanvasSurface;
	readonly index: BlockIndex;
	readonly model: ViewDocument;
	readonly styles: ViewStyles;
	readonly painter: CanvasPainter;
	readonly reveal: RevealPolicy;
	readonly widthHold: WidthHold;
	readonly failures: BlockFailures;
	readonly onReady?: () => void;
	/** the engine's font load (readyGate.ts) */
	loadFonts(fonts: readonly string[]): Promise<void>;
	geometry(): CanvasGeometry;
	scroller(): HTMLElement;
	focus(): PaintFrame['focus'];
	head(): CaretPlace;
	/** an input method's preedit, underlined by the painter */
	composition(): PaintFrame['composition'];
	/** after paint: the input surface's place, onLayout when geometry moved, onFrame */
	painted(moved: boolean): void;
	/** the window's idle slices; tests hand their own */
	idle?: IdleScheduler;
};

type VisibleRange = { readonly first: number; readonly last: number };

/** a reveal or a held place that scrolls brings other blocks in: they are laid out and held again this many times */
const LAYOUT_PASSES = 3;

function sameRange(a: VisibleRange, b: VisibleRange): boolean {
	return a.first === b.first && a.last === b.last;
}

export class FrameLoop {
	readonly anchor: ScrollAnchor;
	readonly stats = new FrameStats();
	readonly ready: ReadyGate;
	private readonly idle: IdleHeights;
	private readonly tiles: TilePaint;
	private readonly shownMark = new PaneShownMark();
	private readonly win: Window;
	private request = 0;
	private caretRequest = 0;
	private running = false;
	private moved = false;
	private destroyed = false;
	private range: VisibleRange = { first: 0, last: -1 };
	/** the blocks idle slices lay out ahead of a scroll: a viewport behind it and two the way it goes */
	private ahead: VisibleRange = { first: 0, last: -1 };
	private lastViewportY = 0;
	private readonly quiet: QuietTimers;
	private lastFrame: PaintFrame | null = null;
	private settling: (() => void)[] = [];
	private attached: HTMLElement | null = null;
	private detach: (() => void) | null = null;

	constructor(private readonly parts: FrameParts) {
		const { model, index } = parts;
		this.win = parts.surface.dom.ownerDocument.defaultView!;
		this.anchor = new ScrollAnchor(index, {
			indexAtY: (y) => model.indexAtY(y),
			blockTop: (i) => model.top(i).y,
			posAtY: (y) => parts.geometry().hit({ x: 0, y })?.pos ?? null,
			lineOf: (pos) => parts.geometry().lineOf({ pos, affinity: 1 })
		});
		this.idle = new IdleHeights(
			{
				get count() {
					return model.count;
				},
				get estimatedCount() {
					return model.estimatedCount;
				},
				estimated: (i) => model.estimated(i),
				measure: (i) => model.measure(i),
				visible: () => this.range,
				ahead: () => this.ahead,
				laidOut: (i) => model.cached(i) !== null,
				prepare: (i) => this.prepare(i),
				measured: () => this.changed(),
				paused: () => parts.widthHold.holding,
				typing: () => this.quiet.typing
			},
			parts.idle ?? idleSchedulerOf(this.win)
		);
		this.quiet = new QuietTimers(this.win, () => model.rest(this.ahead), this.idle);
		this.tiles = new TilePaint({
			surface: parts.surface,
			painter: parts.painter,
			idle: parts.idle ?? idleSchedulerOf(this.win),
			nodeOf: (i) => model.block(i).node,
			blocksOver: (top, bottom) => this.blocksOver(top, bottom),
			frameWith: (blocks, viewport) => this.frameWith(blocks, viewport),
			paintFailed: (block, thrown) => this.paintFailed(block, thrown),
			groundFailed: (thrown) => parts.failures.report(parts.head().pos, 'ground', thrown)
		});
		this.ready = viewReadyGate(parts, this.shownMark, () => this.requestFrame());
	}

	/** the blocks the last frame placed */
	get visible(): VisibleRange {
		return this.range;
	}

	get lastPainted(): PaintFrame | null {
		return this.lastFrame;
	}

	requestFrame(): void {
		if (this.request || this.destroyed) return;
		this.request = this.win.requestAnimationFrame(() => this.run());
	}

	/** heights, inputs or elements changed: the next frame tells onLayout; outside a frame it asks for one */
	changed(): void {
		this.moved = true;
		if (!this.running) this.requestFrame();
	}

	/** a key or typed text: frameStats().keyToFrameMs counts from it */
	noteInput(at: number): void {
		this.stats.noteInput(at);
		this.quiet.typed();
	}

	/** the blink: the caret layer alone, from the last frame */
	requestCarets(): void {
		if (this.caretRequest || this.request || this.destroyed) return;
		this.caretRequest = this.win.requestAnimationFrame(() => {
			this.caretRequest = 0;
			const last = this.lastFrame;
			if (last && !this.request)
				this.paintCarets({ ...last, state: this.parts.view.state, focus: this.parts.focus(), head: this.parts.head() });
		});
	}

	/** runs change() and keeps the caret's line or the first visible line where it was on screen */
	holdPosition<T>(change: () => T, place: 'caret' | 'viewport'): T {
		const { parts } = this;
		const scroller = parts.scroller();
		this.anchor.capture(parts.surface.visibleTop(scroller), parts.head().pos);
		this.anchor.hold(place);
		const result = change();
		parts.model.setWidth(this.columnWidth());
		parts.surface.setHeight(parts.model.height);
		this.anchor.scrollFor(this.parts.scroller(), this.parts.surface.zoom);
		this.requestFrame();
		return result;
	}

	/** D18: blocks lay out at the column width over the zoom; the first visible line keeps its place on screen */
	setZoom(zoom: number): void {
		const { surface } = this.parts;
		if (zoom === surface.zoom) return;
		const scroller = this.parts.scroller();
		const visible = surface.visibleTop(scroller) + surface.root.top;
		const offset = scroller.scrollTop - visible * surface.zoom;
		this.holdPosition(() => {
			surface.zoom = zoom;
			if (visible > 0) scroller.scrollTop = visible * zoom + offset;
		}, 'viewport');
	}

	/** resolves after a painted frame with nothing pending: no frame asked for, no replaced content unsized on screen */
	settle(): Promise<void> {
		return new Promise((resolve) => {
			this.settling.push(resolve);
			this.requestFrame();
		});
	}

	/** a frame now; requestFrame's callback */
	run(): void {
		if (this.request) this.win.cancelAnimationFrame(this.request);
		this.request = 0;
		if (this.destroyed) return;
		this.running = true;
		try {
			// the frame onReady asks for (its caret restore) runs in the same task: the first frame shown is drawn where it lands
			const fired = this.frame();
			if (fired && this.request && !this.destroyed) {
				this.win.cancelAnimationFrame(this.request);
				this.request = 0;
				this.frame();
			}
			if (fired) this.shownMark.show();
		} finally {
			this.running = false;
		}
	}

	destroy(): void {
		this.destroyed = true;
		this.quiet.destroy();
		this.win.cancelAnimationFrame(this.request);
		this.win.cancelAnimationFrame(this.caretRequest);
		this.idle.stop();
		this.tiles.destroy();
		this.detach?.();
		this.shownMark.destroy();
	}

	/** whether the ready gate fired in it */
	private frame(again = true): boolean {
		const { parts } = this;
		const { model, surface } = parts;
		const start = performance.now();
		const laidBefore = model.laidOut;
		const styleBefore = parts.styles.styleMs;
		parts.styles.checkEpoch();
		model.setWidth(this.columnWidth());
		const scroller = parts.scroller();
		this.listen(scroller);
		surface.setHeight(model.height);
		this.anchor.scrollFor(this.parts.scroller(), this.parts.surface.zoom);
		let range = this.layoutRange(this.placeRows(scroller));
		surface.setHeight(model.height);
		this.anchor.scrollFor(this.parts.scroller(), this.parts.surface.zoom);
		const before = scroller.scrollTop;
		parts.reveal.run();
		if (scroller.scrollTop !== before) {
			this.anchor.capture(surface.visibleTop(scroller), parts.head().pos);
			this.anchor.hold('caret');
		}
		for (let pass = 1; pass < LAYOUT_PASSES; pass++) {
			const next = this.rangeOf(this.placeRows(scroller));
			if (sameRange(next, range)) break;
			range = this.layoutRange(this.placeRows(scroller));
			surface.setHeight(model.height);
			this.anchor.scrollFor(this.parts.scroller(), this.parts.surface.zoom);
		}
		const viewport = surface.place(scroller);
		model.paneTop = viewport.y;
		this.range = this.rangeOf(viewport);
		const down = viewport.y >= this.lastViewportY;
		this.lastViewportY = viewport.y;
		this.ahead = this.rangeOf({ ...viewport, y: viewport.y - (down ? 1 : 2) * viewport.height, height: 4 * viewport.height });
		const layoutEpoch = parts.styles.epoch;
		const painting = performance.now();
		const blocks = this.paint(viewport, range);
		this.stats.noteFrameStyle(parts.styles.styleMs - styleBefore);
		// the paint met a style whose layout changed (a mode switch, a block a swap replaced): laid out again before it shows
		if (again && parts.styles.epoch !== layoutEpoch) return this.frame(false);
		const end = performance.now();
		const fired = this.ready.painted(blocks);
		if (fired) this.stats.noteFirstScreen();
		this.anchor.capture(surface.visibleTop(scroller), this.caretOnScreen(viewport));
		model.sweep();
		this.idle.start();
		this.quiet.painted();
		this.stats.framePainted(painting - start, end - painting, model.laidOut - laidBefore, end);
		this.stats.notePaint(this.tiles.paintedPx, this.tiles.lateRows, surface.tiles.pixels);
		const moved = this.moved;
		this.moved = false;
		parts.painted(moved);
		this.resolveSettled(blocks);
		return fired;
	}

	/** the root box laid out at view.dom's width: its content width, or the held one */
	private columnWidth(): number {
		const { surface, styles, widthHold } = this.parts;
		surface.layRoot(styles.rootStyle().layout);
		return widthHold.widthFor(surface.columnWidth());
	}

	private rangeOf(viewport: DocRect): VisibleRange {
		const { model } = this.parts;
		if (!model.count) return { first: 0, last: -1 };
		const first = Math.max(0, model.indexAtY(viewport.y) - 1);
		return { first, last: Math.min(model.count - 1, model.indexAtY(viewport.y + viewport.height) + 1) };
	}

	/** a block near the viewport laid out in an idle slice; a throw is the frame's to report when it gets there */
	private prepare(index: number): void {
		const { model } = this.parts;
		try {
			model.elements(index);
			model.layout(index);
		} catch {
			// the frame that reaches the block meets the same throw and draws it as source
		}
	}

	/** the visible blocks with one above and one below: built first, so a block whose counters moved is rebuilt and relaid */
	private layoutRange(viewport: DocRect): VisibleRange {
		const { model, index, failures } = this.parts;
		const range = this.rangeOf(viewport);
		if (range.last < range.first) return range;
		const { from, to, decorations } = this.decorationsOf(this.paintedRange());
		model.setFrameDecorations(from, to, decorations);
		for (let i = range.first; i <= range.last; i++)
			try {
				model.elements(i);
			} catch {
				// the layout meets the same throw, draws the block as source and reports it
			}
		for (let i = range.first; i <= range.last; i++)
			try {
				model.layout(i);
			} catch (thrown) {
				failures.report(index.blocks[i].pos, index.blocks[i].node.type.name, thrown);
			}
		return range;
	}

	/** collected once per state and range (collectDecorations memoizes), so the layouts and the painter share them */
	private decorationsOf(range: VisibleRange): { from: number; to: number; decorations: FrameDecorations } {
		const { blocks } = this.parts.index;
		if (range.last < range.first) return { from: 0, to: 0, decorations: collectDecorations(this.parts.view, 0, 0) };
		const from = blocks[range.first].pos;
		const to = blocks[range.last].pos + blocks[range.last].node.nodeSize;
		return { from, to, decorations: collectDecorations(this.parts.view, from, to) };
	}

	/** the doc rect of the rows the pane shows: the frame lays out every block they reach */
	private placeRows(scroller: HTMLElement): DocRect {
		this.parts.surface.place(scroller);
		return this.tiles.shownRowsRect();
	}

	/** the blocks the rows ahead reach, which the frame's decorations cover */
	private paintedRange(): VisibleRange {
		return this.rangeOf(this.tiles.aheadRect());
	}

	private placed(range: VisibleRange): PlacedBlock[] {
		const { model } = this.parts;
		const blocks: PlacedBlock[] = [];
		for (let i = range.first; i <= range.last; i++) {
			const layout = model.cached(i);
			if (layout) blocks.push({ index: i, pos: model.block(i).pos, top: model.top(i).y, layout });
		}
		return blocks;
	}

	private frameOf(blocks: readonly PlacedBlock[], viewport: DocRect): PaintFrame {
		const { parts } = this;
		const { surface, model } = parts;
		return {
			state: parts.view.state,
			viewport,
			zoom: surface.zoom,
			dpr: surface.dpr,
			blocks,
			decorations: this.decorationsOf(this.paintedRange()).decorations,
			focus: parts.focus(),
			head: parts.head(),
			root: { rect: rootSheetRect(surface.root, model.height), style: parts.styles.rootStyle() },
			composition: parts.composition()
		};
	}

	/** the shown rows' blocks painted where they changed; returns the visible ones for the ready gate */
	private paint(viewport: DocRect, rows: VisibleRange): PlacedBlock[] {
		const blocks = this.placed(rows);
		const frame = this.frameOf(blocks, viewport);
		this.tiles.paint(frame);
		this.paintCarets(frame);
		this.lastFrame = frame;
		return blocks.filter((block) => block.index >= this.range.first && block.index <= this.range.last);
	}

	/** a row ahead's blocks, in an idle slice; null while a frame is due, or after laying one out (its height may move) */
	private blocksOver(top: number, bottom: number): PlacedBlock[] | null {
		const { model } = this.parts;
		if (this.request || !this.lastFrame || this.lastFrame.state !== this.parts.view.state || !model.count) return null;
		const range = { first: model.indexAtY(top), last: model.indexAtY(bottom) };
		let laid = false;
		for (let i = range.first; i <= range.last; i++)
			if (!model.cached(i)) {
				this.prepare(i);
				laid = true;
			}
		if (laid) {
			this.changed();
			return null;
		}
		return this.placed(range);
	}

	private frameWith(blocks: readonly PlacedBlock[], viewport: DocRect): PaintFrame | null {
		const last = this.lastFrame;
		return last && !this.request ? { ...last, blocks, viewport } : null;
	}

	private paintFailed(block: PlacedBlock, thrown: unknown): void {
		const { model, failures } = this.parts;
		if (block.layout.error) failures.report(block.pos, model.block(block.index).node.type.name, thrown);
		else {
			model.paintFailed(block.index, thrown);
			this.requestFrame();
		}
	}

	private paintCarets(frame: PaintFrame): void {
		const { surface, painter } = this.parts;
		this.isolated(frame.head.pos, 'caret', () => painter.paintCarets(frame, (bounds) => surface.caretContextOver(bounds, frame)));
	}

	private isolated(pos: number, type: string, paint: () => void): void {
		try {
			paint();
		} catch (thrown) {
			this.parts.failures.report(pos, type, thrown);
		}
	}

	private caretOnScreen(viewport: DocRect): number | null {
		const head = this.parts.head();
		// a caret rect lays its block out, and an off-screen block laid out here would move the place before its capture
		const at = this.parts.model.indexAt(head.pos);
		if (at < this.range.first || at > this.range.last) return null;
		const rect = this.parts.geometry().caretRect(head);
		return rect && rect.y + rect.height > viewport.y && rect.y < viewport.y + viewport.height ? head.pos : null;
	}

	private resolveSettled(blocks: readonly PlacedBlock[]): void {
		if (!this.settling.length || this.request || !this.ready.ready || readinessOf(blocks).pending) return;
		const settled = this.settling;
		this.settling = [];
		for (const resolve of settled) resolve();
	}

	private listen(scroller: HTMLElement): void {
		if (this.attached === scroller) return;
		this.detach?.();
		this.attached = scroller;
		this.shownMark.attach(scroller);
		const { dom } = this.parts.surface;
		this.detach = listenToPane(this.win, scroller, dom.parentElement ?? dom, {
			frame: () => this.requestFrame(),
			dragging: (on) => this.anchor.setDragging(on),
			smoothScrollEnded: () => this.anchor.smoothScrollEnded()
		});
	}
}
