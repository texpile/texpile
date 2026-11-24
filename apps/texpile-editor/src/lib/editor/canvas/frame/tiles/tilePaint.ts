// the content rows' painting (2.5, 6.2): a frame repaints the doc bands of the shown rows whose content changed, and
// idle slices paint the rows a scroll reaches next, so the browser scrolls over text that is already drawn
import type { Node as PMNode } from 'prosemirror-model';
import type { CanvasPainter, PaintedBlock, PaintFrame, PlacedBlock } from '../../contracts/engineTypes';
import type { DocRect } from '../../contracts/layoutTypes';
import type { IdleScheduler, IdleSlice } from '../idleScheduler';
import { TILE_DEVICE_PX, type CanvasTile } from './canvasTiles';
import type { CanvasSurface } from '../surface';
import { blockPaintsOf, blocksOver, changedBands, INK_OVERFLOW, reaches, sceneOf, type DocBand, type TileContent } from './tileContent';

export type TilePaintParts = {
	readonly surface: CanvasSurface;
	readonly painter: CanvasPainter;
	readonly idle: IdleScheduler;
	nodeOf(index: number): PMNode;
	/** a row ahead's blocks; null when it waits for a frame (one is due, or a block was just laid out) */
	blocksOver(top: number, bottom: number): PlacedBlock[] | null;
	/** the last frame's paint inputs with other blocks and another viewport */
	frameWith(blocks: readonly PlacedBlock[], viewport: DocRect): PaintFrame | null;
	/** a block's paint threw; the frame reports it or draws it as source next time */
	paintFailed(block: PlacedBlock, thrown: unknown): void;
	groundFailed(thrown: unknown): void;
};

/** css px painted ahead past each edge of the pane, as a share of its height */
const AHEAD_SHARE = 0.5;
const AHEAD_SLICE_MS = 6;

type RowPlan = { readonly row: number; readonly rect: DocRect; readonly content: TileContent; readonly blocks: readonly PlacedBlock[] };

export class TilePaint {
	/** device pixels the last frame painted */
	paintedPx = 0;
	/** rows that came on screen before an idle slice painted them */
	lateRows = 0;
	private cancelIdle: (() => void) | null = null;
	/** bumped by every frame: a painted row ahead is checked again in the next idle slice */
	private generation = 0;
	private readonly checked = new WeakMap<CanvasTile, number>();
	private lastShown: { first: number; last: number } | null = null;

	constructor(private readonly parts: TilePaintParts) {}

	/** the shown rows now; the rows ahead in idle slices */
	paint(frame: PaintFrame): void {
		const { surface, painter } = this.parts;
		const { tiles, shown } = surface;
		this.generation++;
		this.paintedPx = 0;
		tiles.setOpaque(painter.opaque);
		const ahead = surface.rowsShown(Math.max(tiles.rowHeight, AHEAD_SHARE * shown.height));
		tiles.keep(ahead.first, ahead.last);
		const rows = surface.rowsShown();
		const before = this.lastShown;
		this.lastShown = rows;
		for (let row = rows.first; row <= rows.last; row++) {
			const tile = tiles.tile(row);
			if (tiles.contentOf(tile) === null && before && (row < before.first || row > before.last)) this.lateRows++;
			const plan = this.planOf(row, frame, frame.blocks);
			this.paintPlan(tile, plan, frame);
			this.checked.set(tile, this.generation);
		}
		this.scheduleAhead();
	}

	/** rows the doc rect reaches, for the frame's layout range */
	shownRowsRect(): DocRect {
		const { surface } = this.parts;
		const rows = surface.rowsShown();
		if (rows.last < rows.first) return surface.rowRect(0);
		const first = surface.rowRect(rows.first);
		const last = surface.rowRect(rows.last);
		return { ...first, height: last.y + last.height - first.y };
	}

	/** the rows' doc band ahead of the pane, which the frame's decorations cover */
	aheadRect(): DocRect {
		const { surface } = this.parts;
		const rows = surface.rowsShown(Math.max(surface.tiles.rowHeight, AHEAD_SHARE * surface.shown.height));
		const first = surface.rowRect(Math.max(0, rows.first));
		const last = surface.rowRect(Math.max(rows.first, rows.last));
		return { ...first, height: last.y + last.height - first.y };
	}

	destroy(): void {
		this.cancelIdle?.();
		this.cancelIdle = null;
	}

	private planOf(row: number, frame: PaintFrame, from: readonly PlacedBlock[]): RowPlan {
		const rect = this.parts.surface.rowRect(row);
		const blocks = blocksOver(from, rect.y, rect.y + rect.height);
		const scene = sceneOf({ ...frame, viewport: rect }, this.parts.painter.paintKey?.() ?? '');
		const { painter } = this.parts;
		const sessionKey = painter.sessionKey && ((block: PlacedBlock) => painter.sessionKey!(block, frame));
		const content: TileContent = { scene, blocks: blockPaintsOf(blocks, frame, this.parts.nodeOf, sessionKey) };
		return { row, rect, content, blocks };
	}

	private paintPlan(tile: CanvasTile, plan: RowPlan, frame: PaintFrame): void {
		const { tiles } = this.parts.surface;
		const { painter } = this.parts;
		const ink = painter.changedInk && ((before: PaintedBlock, after: PaintedBlock) => painter.changedInk!(before, after));
		const bands = changedBands(tiles.contentOf(tile) as TileContent | null, plan.content, plan.rect, ink);
		if (bands !== 'all' && !bands.length) return;
		const ctx = tiles.context(tile);
		if (!ctx) return;
		this.paintBands(ctx, tile, plan, bands === 'all' ? [{ from: plan.rect.y, to: plan.rect.y + plan.rect.height }] : bands, frame);
		tiles.setContent(tile, plan.content);
	}

	/** whole device rows of the bands under one clip, the ground first, so a band's edges leave no seam */
	private paintBands(ctx: CanvasRenderingContext2D, tile: CanvasTile, plan: RowPlan, bands: readonly DocBand[], frame: PaintFrame): void {
		const { painter } = this.parts;
		const { rect } = plan;
		const scale = frame.dpr * frame.zoom;
		const width = tile.canvas.width;
		const rows = bands
			.map((band) => ({
				top: Math.max(0, Math.floor((band.from - rect.y) * scale)),
				bottom: Math.min(TILE_DEVICE_PX, Math.ceil((band.to - rect.y) * scale))
			}))
			.filter((row) => row.bottom > row.top);
		if (!rows.length) return;
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.beginPath();
		for (const row of rows) ctx.rect(0, row.top, width, row.bottom - row.top);
		ctx.clip();
		const from = rect.y + (rows[0].top - 1) / scale;
		const to = rect.y + (rows[rows.length - 1].bottom + 1) / scale;
		const banded: PaintFrame = { ...frame, viewport: { x: rect.x, y: from, width: rect.width, height: to - from } };
		ctx.setTransform(scale, 0, 0, scale, -rect.x * scale, -rect.y * scale);
		try {
			painter.ground(ctx, banded);
		} catch (thrown) {
			this.parts.groundFailed(thrown);
		}
		for (const block of plan.blocks) {
			if (!rows.some((row) => reaches(block, rect.y + row.top / scale, rect.y + row.bottom / scale))) continue;
			ctx.save();
			ctx.setTransform(scale, 0, 0, scale, -rect.x * scale, (block.top - rect.y) * scale);
			try {
				painter.paintBlock(ctx, block, banded);
			} catch (thrown) {
				this.parts.paintFailed(block, thrown);
			} finally {
				ctx.restore();
			}
		}
		ctx.restore();
		this.paintedPx += width * rows.reduce((sum, row) => sum + row.bottom - row.top, 0);
	}

	private scheduleAhead(): void {
		if (this.cancelIdle || this.nextAhead() === null) return;
		this.cancelIdle = this.parts.idle((slice) => this.runAhead(slice));
	}

	private runAhead(slice: IdleSlice): void {
		this.cancelIdle = null;
		const start = performance.now();
		while (slice.timeRemaining() > 0 && performance.now() - start < AHEAD_SLICE_MS) {
			const row = this.nextAhead();
			if (row === null) return;
			this.paintAhead(row);
		}
		this.scheduleAhead();
	}

	/** the nearest row ahead not checked since the last frame, below before above */
	private nextAhead(): number | null {
		const { surface } = this.parts;
		const shown = surface.rowsShown();
		const ahead = surface.rowsShown(Math.max(surface.tiles.rowHeight, AHEAD_SHARE * surface.shown.height));
		for (let distance = 1; shown.last + distance <= ahead.last || shown.first - distance >= ahead.first; distance++)
			for (const row of [shown.last + distance, shown.first - distance]) {
				if (row < ahead.first || row > ahead.last) continue;
				const tile = surface.tiles.at(row);
				if (!tile || this.checked.get(tile) !== this.generation) return row;
			}
		return null;
	}

	private paintAhead(row: number): void {
		const { surface, blocksOver, frameWith } = this.parts;
		const tile = surface.tiles.tile(row);
		this.checked.set(tile, this.generation);
		const rect = surface.rowRect(row);
		const blocks = blocksOver(rect.y - INK_OVERFLOW, rect.y + rect.height + INK_OVERFLOW);
		const frame = blocks && frameWith(blocks, rect);
		if (!blocks || !frame) return;
		this.paintPlan(tile, this.planOf(row, frame, blocks), frame);
	}
}
