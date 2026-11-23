// the carets the caret layer draws from state (6.4, D19): the local caret, the blur caret while focus sits in an overlay,
// and the gap cursor; their looks are caretLooks.ts
import { GapCursor } from 'prosemirror-gapcursor';
import { TextSelection, type EditorState } from 'prosemirror-state';
import type { CanvasGeometry } from '../contracts/geometryTypes';
import type { DocRect } from '../contracts/layoutTypes';
import type { NestedEditor } from '../contracts/nodeViewTypes';
import type { AnimationRef, CanvasStyles, ComputedStyle, Rgba, RunStyle, ThemeToken } from '../contracts/styleTypes';
import type { DocumentModel, DrawnCaret, PaintFrame } from '../contracts/engineTypes';
import { caretRectAt, caretSpotOf, type CaretSpot, type GeometryTools } from '../geometry/caretRects';
import { fragmentAt } from '../geometry/positionMap';
import { paintPeerFlag, peerCaretsOf, type PeerArrivals, type PeerFlagDraw } from '../decorations/peerCarets';
import { canvasFill } from '../style/resolve/colorValue';
import { animationFrameAt } from './animations';
import { CARET_HALF_PERIOD_MS, type CaretBlink } from './blink';
import { devicePixelsOf, snapRect } from './devicePixels';
import { BLUR_CARET_LOOK, GAP_CURSOR_LOOK, MATH_CARET_TOKEN } from './caretLooks';

export type CaretLayerTools = GeometryTools & {
	readonly geometry: CanvasGeometry;
	/** a token's color now (the math caret's --color-surface-950-50) */
	readonly token: (name: ThemeToken) => Rgba;
	readonly styles: Pick<CanvasStyles, 'styleOf' | 'runStyle'>;
	readonly blink: CaretBlink;
	readonly arrivals: PeerArrivals;
	readonly run: (run: RunStyle) => RunStyle;
	readonly style: (style: ComputedStyle) => ComputedStyle;
};

/** a drawn caret with its fill; a peer's carries its name label */
export type CaretDraw = DrawnCaret & { readonly color: string; readonly flag?: PeerFlagDraw };
export type CaretLayerFrame = { readonly carets: readonly CaretDraw[]; readonly nextMs: number | null };

type CaretLook = { width: number; height: number; top: number; color: Rgba | null; animation: AnimationRef | null; em: number };

function gapLook(tools: CaretLayerTools): CaretLook {
	return {
		width: GAP_CURSOR_LOOK.width,
		height: GAP_CURSOR_LOOK.thickness,
		top: GAP_CURSOR_LOOK.top,
		color: tools.token(GAP_CURSOR_LOOK.colorToken),
		animation: GAP_CURSOR_LOOK.animation,
		em: 0
	};
}

const BLUR_LOOK: CaretLook = {
	width: BLUR_CARET_LOOK.width,
	height: 0,
	top: 0,
	color: null,
	animation: BLUR_CARET_LOOK.animation,
	em: BLUR_CARET_LOOK.heightEm
};
// preflight: sup { top: -0.5em } sub { bottom: -0.25em }
const STORED_SHIFT_EM: Record<string, number> = { sup: -0.5, sub: 0.25 };

function colorAt(spot: CaretSpot, tools: CaretLayerTools): { caret: Rgba; text: Rgba; size: number } {
	const fragment = fragmentAt(spot.textblock.lines[spot.index], spot.offset, -1);
	if (fragment?.kind === 'text') {
		const run = tools.run(fragment.run);
		return {
			caret: run.paint.caretColor === 'auto' ? run.paint.color : run.paint.caretColor,
			text: run.paint.color,
			size: run.font.sizePx
		};
	}
	const style = tools.style(spot.textblock.box.style);
	const { caretColor, color } = style.paint;
	return { caret: caretColor === 'auto' ? color : caretColor, text: color, size: style.layout.font.sizePx };
}

function localCaret(spot: CaretSpot, tools: CaretLayerTools): CaretDraw {
	const rect = caretRectAt(spot, tools, -1);
	return { kind: 'local', rect: { ...rect, width: 1 }, visible: tools.blink.visible(), color: canvasFill(colorAt(spot, tools).caret) };
}

function blurCaret(spot: CaretSpot, state: EditorState, tools: CaretLayerTools): { caret: CaretDraw; nextMs: number | null } {
	const look = BLUR_LOOK;
	const { text, size } = colorAt(spot, tools);
	const line = spot.textblock.lines[spot.index];
	const x = caretRectAt(spot, tools, -1).x;
	const height = look.em * size;
	const marks = state.storedMarks ?? [];
	const shift = marks.reduce((sum, mark) => sum + (STORED_SHIFT_EM[mark.type.name] ?? 0), 0) * size;
	const middle = spot.block.frame.top + spot.textblock.y + (line.textTop + line.textBottom) / 2 + shift;
	const frame = look.animation ? animationFrameAt(look.animation, tools.blink.elapsed) : { opacity: 1, nextMs: null };
	const rect: DocRect = { x, y: middle - height / 2, width: look.width, height };
	return { caret: { kind: 'blur', rect, visible: frame.opacity !== 0, color: canvasFill(text) }, nextMs: frame.nextMs };
}

/** the edge of the block a gap cursor stands before, or after at the end of its parent; at the block's margin edge, where
 * prosemirror-gapcursor's widget stood in the parent's flow */
export function gapEdgeOf(selection: GapCursor, geometry: Pick<CanvasGeometry, 'nodeRect'>): { x: number; y: number } | null {
	const { $head } = selection;
	const after = $head.nodeAfter ? geometry.nodeRect($head.pos) : null;
	const before = !after && $head.nodeBefore ? geometry.nodeRect($head.pos - $head.nodeBefore.nodeSize) : null;
	if (after) return { x: after.rect.x - (after.marginLeft ?? 0), y: after.rect.y };
	return before ? { x: before.rect.x - (before.marginLeft ?? 0), y: before.rect.y + before.rect.height } : null;
}

function gapCaret(selection: GapCursor, tools: CaretLayerTools, text: Rgba): { caret: CaretDraw; nextMs: number | null } | null {
	const look = gapLook(tools);
	const edge = gapEdgeOf(selection, tools.geometry);
	if (!edge) return null;
	const frame = look.animation ? animationFrameAt(look.animation, tools.blink.elapsed) : { opacity: 1, nextMs: null };
	const rect: DocRect = { x: edge.x, y: edge.y + look.top, width: look.width, height: look.height };
	return { caret: { kind: 'gap', rect, visible: frame.opacity !== 0, color: canvasFill(look.color ?? text) }, nextMs: frame.nextMs };
}

/** the local carets, then every peer's */
export function caretsOf(model: DocumentModel, frame: PaintFrame, tools: CaretLayerTools): CaretLayerFrame {
	const local = localCaretsOf(model, frame, tools);
	const peers = peerCaretsOf(model, frame, tools);
	if (!peers.carets.length) return local;
	const nextMs = local.nextMs === null || peers.nextMs === null ? (local.nextMs ?? peers.nextMs) : Math.min(local.nextMs, peers.nextMs);
	return { carets: [...local.carets, ...peers.carets], nextMs };
}

// MathLive's caret blinks 1.05 s, step-end: shown the first half (mathfield.less ML__caret-blink)
const MATH_CARET_HALF_PERIOD_MS = 525;

/** a formula session's caret, while the editor holds the focus (E7) */
function mathCaretOf(owner: NestedEditor, frame: PaintFrame, tools: CaretLayerTools): CaretLayerFrame {
	const rect = frame.focus === 'editor' ? owner.caretRect() : null;
	if (!rect) return { carets: [], nextMs: null };
	const caret: CaretDraw = {
		kind: 'math',
		rect,
		visible: tools.blink.visible(MATH_CARET_HALF_PERIOD_MS),
		color: canvasFill(tools.token(MATH_CARET_TOKEN))
	};
	return { carets: [caret], nextMs: tools.blink.nextFlip(MATH_CARET_HALF_PERIOD_MS) };
}

/** exactly one local caret at most; nothing while focus is away; a caret owner (formula, island) draws its own */
function localCaretsOf(model: DocumentModel, frame: PaintFrame, tools: CaretLayerTools): CaretLayerFrame {
	const { selection } = frame.state;
	const owner = model.view.canvas?.nested?.() ?? null;
	if (owner?.kind === 'math') return mathCaretOf(owner, frame, tools);
	if (frame.focus === 'away' || owner) return { carets: [], nextMs: null };
	// an off-screen caret draws nothing, and its rect would lay its block out after the frame kept the reading place
	const at = model.count ? model.indexAt(frame.head.pos) : -1;
	if (!frame.blocks.some((block) => block.index === at)) return { carets: [], nextMs: null };
	if (selection instanceof GapCursor) {
		if (frame.focus !== 'editor') return { carets: [], nextMs: null };
		const root = model.count ? tools.style(model.layout(model.indexAt(selection.head)).box.style).paint.color : { r: 0, g: 0, b: 0, a: 1 };
		const gap = gapCaret(selection, tools, root);
		return gap ? { carets: [gap.caret], nextMs: gap.nextMs } : { carets: [], nextMs: null };
	}
	if (!(selection instanceof TextSelection) || !selection.empty) return { carets: [], nextMs: null };
	const spot = caretSpotOf(model, frame.head);
	if (!spot) return { carets: [], nextMs: null };
	if (frame.focus === 'overlay') {
		const blur = blurCaret(spot, frame.state, tools);
		return { carets: [blur.caret], nextMs: blur.nextMs };
	}
	return { carets: [localCaret(spot, tools)], nextMs: tools.blink.nextFlip(CARET_HALF_PERIOD_MS) };
}

/** the doc rect every caret of the layer covers, shown or in its blink's off phase */
export function caretBounds(carets: readonly CaretDraw[]): DocRect | null {
	if (!carets.length) return null;
	let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
	for (const rect of carets.flatMap((caret) => (caret.flag ? [caret.rect, caret.flag.rect] : [caret.rect]))) {
		left = Math.min(left, rect.x);
		top = Math.min(top, rect.y);
		right = Math.max(right, rect.x + rect.width);
		bottom = Math.max(bottom, rect.y + rect.height);
	}
	return { x: left, y: top, width: right - left, height: bottom - top };
}

/** ctx maps doc space */
export function paintCaretDraws(ctx: CanvasRenderingContext2D, carets: readonly CaretDraw[]): void {
	const px = devicePixelsOf(ctx);
	for (const caret of carets) {
		if (!caret.visible) continue;
		const { x, y, height } = snapRect(caret.rect, px);
		// one width wherever it stands, rounded up: edges rounded apart made it 1 or 2 device pixels at 125 percent
		const width = Math.max(1, Math.ceil(caret.rect.width * px.sx - 0.01)) / px.sx;
		Object.assign(ctx, { fillStyle: caret.color });
		ctx.fillRect(x, y, width, height);
		if (caret.flag) paintPeerFlag(ctx, caret.flag);
	}
}
