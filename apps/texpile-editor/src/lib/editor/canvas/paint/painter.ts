// one view's painter (6): an opaque ground (D17), a display list per laid-out block rebuilt only when the paint epoch
// moves (a mode switch repaints without relayout), the decoration and selection layers per frame, and the caret layer
import { MACRO_OUTLINE_TOKEN, SELECTION_FILL_TOKEN } from './caretLooks';
import type { Node as PMNode } from 'prosemirror-model';
import type { CanvasGeometry } from '../contracts/geometryTypes';
import type { BlockLayout, DocRect, TextMeasure } from '../contracts/layoutTypes';
import type { ComputedStyle, Rgba, RunStyle, ThemeToken } from '../contracts/styleTypes';
import type { CanvasPainter, DocumentModel, PaintFrame, PlacedBlock, ViewStyles } from '../contracts/engineTypes';
import type { MathSession } from '../contracts/sessionTypes';
import { placementOf, type BlockOnModel, type BlockPlacement } from '../geometry/lineIndex';
import { runStyleOf, styleOfRun } from '../layout/inline/inlineContent';
import type { FontMetricsReader } from '../layout/text/fontMetrics';
import { canvasFill } from '../style/resolve/colorValue';
import { PeerArrivals } from '../decorations/peerCarets';
import { CaretBlink, type BlinkClock } from './blink';
import { caretBounds, caretsOf, paintCaretDraws, type CaretDraw, type CaretLayerTools } from './caretLayer';
import { devicePixelsOf, snapRect, type DevicePixels } from './devicePixels';
import { buildDisplayList, replayDisplayList, type BlockDisplayList, type PaintOp } from './displayList';
import { inkChanges } from './displayListDiff';
import { rectBoxOps } from './paintBoxes';
import { paintCompositionUnderlines } from './paintComposition';
import { heldPassageShown, paintBlockDecorations } from './paintInline';
import { islandFrameColor, islandFrameRects } from './islandFrame';
import { selectionShade, shadedRange } from './paintSelection';
import type { TextPaintTools } from './paintText';

/** what the painter reads styles through; the paint epoch moves on every style change */
export type PaintStyleSource = Pick<ViewStyles, 'styleOf' | 'runStyle' | 'token' | 'paintEpoch' | 'current' | 'currentRun'>;

export type PainterHost = {
	readonly measure: TextMeasure;
	readonly ligatureBreak: 'hair' | 'zwnj';
	readonly metrics: FontMetricsReader;
	readonly styles: PaintStyleSource;
	readonly geometry: CanvasGeometry;
	/** the first opaque background up the editor's ancestors; null when it is translucent (window glass) */
	readonly ground: () => Rgba | null;
	readonly clock?: BlinkClock;
};

/** lives as long as its layout, which the model's cache keeps for the blocks near the screen */
type CachedList = { readonly epoch: number; readonly node: PMNode; readonly list: BlockDisplayList };

function fillRects(ctx: CanvasRenderingContext2D, rects: readonly DocRect[], color: string, px: DevicePixels): void {
	if (!rects.length) return;
	Object.assign(ctx, { fillStyle: color });
	for (const rect of rects) {
		const { x, y, width, height } = snapRect(rect, px);
		ctx.fillRect(x, y, width, height);
	}
}

/** one px frames drawn inside the rects, as an outline with a -1 px offset */
function strokeInside(ctx: CanvasRenderingContext2D, rects: readonly DocRect[], color: string, px: DevicePixels): void {
	const edges = rects.flatMap(({ x, y, width, height }) => [
		{ x, y, width, height: 1 },
		{ x, y: y + height - 1, width, height: 1 },
		{ x, y, width: 1, height },
		{ x: x + width - 1, y, width: 1, height }
	]);
	fillRects(ctx, edges, color, px);
}

/** a formula session's selection rects or call outlines in this block, the block's own space (E7, T11) */
function formulaRectsIn(model: DocumentModel, block: PlacedBlock, which: 'selectionRects' | 'outlineRects'): DocRect[] {
	const nested = model.view.canvas?.nested?.();
	const owner = nested?.kind === 'math' ? (nested as MathSession) : null;
	const rects = owner?.[which];
	if (!owner || !rects) return [];
	const from = block.pos;
	const to = from + model.block(block.index).node.nodeSize;
	if (owner.pos < from || owner.pos >= to) return [];
	return rects.call(owner).map((rect) => ({ ...rect, y: rect.y - block.top }));
}

export function createCanvasPainter(model: DocumentModel, repaintCarets: () => void, host: PainterHost): CanvasPainter {
	const { styles } = host;
	const lists = new WeakMap<BlockLayout, CachedList>();
	const runs = new WeakMap<RunStyle, { epoch: number; run: RunStyle }>();
	const blink = new CaretBlink(repaintCarets, host.clock);
	let drawn: readonly CaretDraw[] = [];
	let last: { doc: PMNode; selection: PaintFrame['state']['selection']; focus: PaintFrame['focus']; caret: string } | null = null;

	function runNow(run: RunStyle): RunStyle {
		const epoch = styles.paintEpoch;
		const known = runs.get(run);
		if (known?.epoch === epoch) return known.run;
		const base = styleOfRun(run);
		const fresh = base ? runStyleOf(styles.current(base), run.shift ?? 0) : styles.currentRun(run);
		runs.set(run, { epoch, run: fresh });
		return fresh;
	}
	function styleNow(style: ComputedStyle): ComputedStyle {
		return styles.current(style);
	}
	const textTools: TextPaintTools = { metrics: host.metrics, ligatureBreak: host.ligatureBreak, run: runNow, style: styleNow };
	function token(name: ThemeToken): Rgba {
		return styles.token(name);
	}
	const caretTools: CaretLayerTools = {
		measure: host.measure,
		metrics: host.metrics,
		geometry: host.geometry,
		styles,
		blink,
		token,
		arrivals: new PeerArrivals(host.clock ? () => host.clock!.now() : undefined),
		run: runNow,
		style: styleNow
	};

	function listOf(layout: BlockLayout, node: PMNode, placement: BlockPlacement): BlockDisplayList {
		const epoch = styles.paintEpoch;
		const known = lists.get(layout);
		if (known && known.epoch === epoch && known.node === node) return known.list;
		const list = buildDisplayList(placement, textTools);
		lists.set(layout, { epoch, node, list });
		return list;
	}

	return {
		get opaque() {
			return host.ground() !== null;
		},
		changedInk(before, after) {
			const old = lists.get(before.layout);
			if (!old || old.epoch !== styles.paintEpoch || old.node !== before.node) return null;
			return inkChanges(old.list, listOf(after.layout, after.node, placementOf(after.layout, after.node)));
		},
		sessionKey(block, frame) {
			if (frame.focus !== 'editor') return '';
			const rects = [
				...formulaRectsIn(model, block, 'selectionRects'),
				...formulaRectsIn(model, block, 'outlineRects'),
				...islandFrameRects(model, host.geometry, block)
			];
			return rects.map(({ x, y, width, height }) => `${x},${y},${width},${height}`).join(';');
		},
		paintKey() {
			const ground = host.ground();
			return `${styles.paintEpoch}|${ground ? canvasFill(ground) : 'glass'}`;
		},
		ground(ctx, frame) {
			const { x, y, width, height } = frame.viewport;
			const color = host.ground();
			if (color) {
				Object.assign(ctx, { fillStyle: canvasFill(color) });
				ctx.fillRect(x, y, width, height);
			} else ctx.clearRect(x, y, width, height);
			if (!frame.root) return;
			const ops: PaintOp[] = [];
			rectBoxOps(frame.root.rect, frame.root.style.layout, frame.root.style.paint, ops);
			replayDisplayList(ctx, ops, token);
		},
		paintBlock(ctx, block: PlacedBlock, frame) {
			const { node } = model.block(block.index);
			const placement = placementOf(block.layout, node);
			const list = listOf(block.layout, node, placement);
			const onBlock: BlockOnModel = {
				index: block.index,
				node,
				frame: { pos: block.pos, top: 0, estimated: false },
				layout: block.layout,
				placement
			};
			const px = devicePixelsOf(ctx);
			const within = { from: frame.viewport.y - block.top, to: frame.viewport.y + frame.viewport.height - block.top };
			replayDisplayList(ctx, list.under, token, px, within);
			paintBlockDecorations(ctx, onBlock, frame.decorations.inline, { styles, measure: host.measure, metrics: host.metrics }, px);
			const held = frame.focus !== 'editor' && heldPassageShown(frame.decorations.inline);
			const shade = selectionShade(onBlock, held ? null : shadedRange(frame.state.selection), host, frame.decorations.widgets);
			const formula = frame.focus === 'editor' ? formulaRectsIn(model, block, 'selectionRects') : [];
			const selection = shade.under.length || shade.over.length || formula.length ? canvasFill(styles.token(SELECTION_FILL_TOKEN)) : '';
			fillRects(ctx, shade.under, selection, px);
			fillRects(ctx, formula, selection, px);
			replayDisplayList(ctx, list.over, token, px, within);
			if (frame.composition) paintCompositionUnderlines(ctx, onBlock, frame.composition, { measure: host.measure, run: runNow }, px);
			fillRects(ctx, shade.over, selection, px);
			replayDisplayList(ctx, list.outlines, token, px, within);
			const calls = frame.focus === 'editor' ? formulaRectsIn(model, block, 'outlineRects') : [];
			if (calls.length) strokeInside(ctx, calls, canvasFill(styles.token(MACRO_OUTLINE_TOKEN)), px);
			const island = frame.focus === 'editor' ? islandFrameRects(model, host.geometry, block) : [];
			if (island.length) strokeInside(ctx, island, canvasFill(islandFrameColor(styles.token('--color-surface-500'))), px);
		},
		paintCarets(frame, target) {
			const owned = model.view.canvas?.nested?.()?.caretRect();
			const caret = owned ? `${owned.x},${owned.y}` : '';
			const moved =
				!last ||
				last.doc !== frame.state.doc ||
				!last.selection.eq(frame.state.selection) ||
				last.focus !== frame.focus ||
				last.caret !== caret;
			if (moved) blink.restart();
			last = { doc: frame.state.doc, selection: frame.state.selection, focus: frame.focus, caret };
			const layer = caretsOf(model, frame, caretTools);
			drawn = layer.carets;
			const ctx = target(caretBounds(drawn));
			if (ctx) paintCaretDraws(ctx, drawn);
			blink.schedule(layer.nextMs);
		},
		carets: () => drawn,
		destroy() {
			blink.destroy();
		}
	};
}
