// collaborators' carets on the caret layer (6.4, 9.4): a bar in the peer's color at the widget's place and the name
// label above it, shown on arrival for its linger animation; the looks are caretLooks.ts's
import { TextSelection } from 'prosemirror-state';
import type { PeerCaretLook } from '../contracts/decorationTypes';
import type { DocumentModel, DrawnCaret, PaintFrame } from '../contracts/engineTypes';
import type { CanvasGeometry } from '../contracts/geometryTypes';
import type { DocRect } from '../contracts/layoutTypes';
import type { AnimationRef, CanvasStyles, ComputedStyle, RunChain, RunChainLevel } from '../contracts/styleTypes';
import { caretRectAt, caretSpotOf, type GeometryTools } from '../geometry/caretRects';
import { animationFrameAt } from '../paint/animations';
import { canvasFill } from '../style/resolve/colorValue';
import { GAP_CURSOR_LOOK, remoteCaretLooks } from '../paint/caretLooks';
import { faceElement, type FaceElement } from '../tree/faceElement';
import { setLook } from '../tree/faceStyle';

export type PeerFlagDraw = {
	readonly rect: DocRect;
	readonly radius: number;
	readonly background: string;
	readonly text: string;
	readonly font: string;
	readonly color: string;
	readonly textX: number;
	readonly baseline: number;
	readonly opacity: number;
};
export type PeerCaretDraw = DrawnCaret & { readonly color: string; readonly flag: PeerFlagDraw };

export type PeerCaretTools = GeometryTools & {
	readonly styles: Pick<CanvasStyles, 'styleOf' | 'runStyle'>;
	readonly arrivals: PeerArrivals;
	/** a block's box, for a peer standing between blocks */
	readonly geometry: Pick<CanvasGeometry, 'nodeRect'>;
};

/** where a peer's caret stands: a bar on a line, or a gap cursor's bar at a block's edge; the textblock its label reads its
 *  font from */
type PeerPlace = { readonly bar: DocRect; readonly top: number; readonly x: number; readonly hole: FaceElement; readonly gap: boolean };

// a gap bar is drawn this thick for a peer: the local gap cursor's 1 px reads as a rule, not a caret
const PEER_GAP_THICKNESS = 2;

function onLine(model: DocumentModel, pos: number, width: number, tools: PeerCaretTools): PeerPlace | null {
	const spot = caretSpotOf(model, { pos, affinity: 1 });
	const hole = spot?.textblock.box.element;
	if (!spot || !hole) return null;
	const line = spot.textblock.lines[spot.index];
	const x = caretRectAt(spot, tools, 1).x;
	// the bar spans the widget span's content area: the textblock's own font at its baseline
	const top = spot.block.frame.top + spot.textblock.y + line.textTop;
	return { bar: { x, y: top, width, height: line.textBottom - line.textTop }, top, x, hole, gap: false };
}

// textblocks a label looks past for its font: the source of blocks drawn whole has no line of its own
const FONT_SEARCH = 24;

/** the first laid-out textblock from `from` in `dir`, whose font a label beside a block takes */
function labelFontNear(model: DocumentModel, from: number, dir: -1 | 1): FaceElement | null {
	const { doc } = model.view.state;
	let at = from;
	for (let step = 0; step < FONT_SEARCH; step++) {
		const near = TextSelection.findFrom(doc.resolve(at), dir, true);
		if (!near) return null;
		const hole = caretSpotOf(model, { pos: near.head, affinity: 1 })?.textblock.box.element;
		if (hole) return hole;
		at = dir > 0 ? near.$head.after() : near.$head.before();
	}
	return null;
}

/** a peer between blocks, or in the source of a block drawn whole: the edge of the block, as the gap cursor stands */
function atBlockEdge(model: DocumentModel, pos: number, tools: PeerCaretTools): PeerPlace | null {
	const { doc } = model.view.state;
	const $pos = doc.resolve(Math.min(pos, doc.content.size));
	const at = $pos.parent.inlineContent && $pos.depth > 0 ? $pos.before() : $pos.pos;
	const $at = doc.resolve(at);
	const after = $at.nodeAfter ? tools.geometry.nodeRect(at) : null;
	const before = !after && $at.nodeBefore ? tools.geometry.nodeRect(at - $at.nodeBefore.nodeSize) : null;
	const box = after ?? before;
	if (!box) return null;
	const x = box.rect.x - (box.marginLeft ?? 0);
	const y = after ? box.rect.y : box.rect.y + box.rect.height;
	const hole = labelFontNear(model, at, 1) ?? labelFontNear(model, at, -1);
	if (!hole) return null;
	const bar = { x, y: y + GAP_CURSOR_LOOK.top, width: GAP_CURSOR_LOOK.width, height: PEER_GAP_THICKNESS };
	return { bar, top: bar.y, x, hole, gap: true };
}

type PeerProbes = { readonly caret: FaceElement; readonly label: FaceElement; readonly chain: RunChain; readonly linger: AnimationRef };

const probes = new WeakMap<object, Map<string, PeerProbes>>();

const KEPT_ARRIVALS = 256;
/** the label at rest, once its linger ends */
const REST_OPACITY = 0;

/** when each arrival was first drawn: one scrolled back into view lingers no more */
export class PeerArrivals {
	private readonly seen = new Map<string, number>();

	constructor(private readonly now: () => number = () => performance.now()) {}

	elapsed(arrivals: readonly string[]): number[] {
		const now = this.now();
		return arrivals.map((key) => {
			let since = this.seen.get(key);
			if (since === undefined) {
				this.seen.set(key, (since = now));
				if (this.seen.size > KEPT_ARRIVALS) this.seen.delete(this.seen.keys().next().value!);
			}
			return now - since;
		});
	}
}

function probesOf(styles: object, color: string): PeerProbes {
	let byColor = probes.get(styles);
	if (!byColor) probes.set(styles, (byColor = new Map()));
	const known = byColor.get(color);
	if (known) return known;
	const looks = remoteCaretLooks(color);
	const caret = faceElement('span', 'pm-remote-caret');
	const bar = faceElement('span');
	bar.generated = true;
	setLook(bar, looks.bar);
	caret.generatedBefore = bar;
	const label = faceElement('span', 'pm-remote-caret-label');
	setLook(label, looks.label);
	caret.appendChild(label);
	const caretLevel: RunChainLevel = { tag: 'span', classes: ['pm-remote-caret'], attrs: {}, hovered: false };
	const labelLevel: RunChainLevel = { tag: 'span', classes: ['pm-remote-caret-label'], attrs: {}, hovered: false, look: looks.label };
	const found = { caret, label, chain: { key: `peer:${color}`, levels: [caretLevel, labelLevel] }, linger: looks.linger };
	byColor.set(color, found);
	return found;
}

function insetOf(style: ComputedStyle, side: 'left' | 'top'): number {
	const value = style.layout.inset[side];
	return value === 'auto' ? 0 : value.px;
}

function peerCaret(
	model: DocumentModel,
	pos: number,
	peer: PeerCaretLook,
	elapsed: number,
	tools: PeerCaretTools
): { caret: PeerCaretDraw; nextMs: number | null } | null {
	const { caret: caretProbe, label: labelProbe, chain, linger } = probesOf(tools.styles, peer.color);
	const bar = tools.styles.styleOf(caretProbe, 'before');
	const loose = tools.styles.styleOf(labelProbe);
	if (!bar || !loose) return null;
	const width = typeof bar.layout.width === 'object' ? bar.layout.width.px : 0;
	const place = onLine(model, pos, width, tools) ?? atBlockEdge(model, pos, tools);
	if (!place) return null;
	const { top, hole } = place;
	const at = place.x;
	const rect: DocRect = place.gap ? place.bar : { ...place.bar, x: place.bar.x + insetOf(bar, 'left') };
	// the label's size is in em of the text it sits in; its offset is in its own em
	const run = tools.styles.runStyle(hole, chain);
	const metrics = tools.metrics(run.fontString);
	const height = typeof run.lineHeight === 'number' ? run.lineHeight : metrics.ascent + metrics.descent;
	const above = loose.layout.font.sizePx ? (insetOf(loose, 'top') / loose.layout.font.sizePx) * run.font.sizePx : 0;
	const flagRect: DocRect = {
		x: at + insetOf(loose, 'left'),
		y: top + above,
		width: run.edges.start + tools.measure(run.fontString, peer.name) + run.edges.end,
		height
	};
	const frame = animationFrameAt(linger, elapsed);
	const flag: PeerFlagDraw = {
		rect: flagRect,
		radius: run.paint.borderRadius.tl,
		background: canvasFill(run.paint.backgroundColor),
		text: peer.name,
		font: run.fontString,
		color: canvasFill(run.paint.color),
		textX: flagRect.x + run.edges.start,
		baseline: flagRect.y + (height - metrics.ascent - metrics.descent) / 2 + metrics.ascent,
		opacity: frame.opacity ?? REST_OPACITY
	};
	const caret: PeerCaretDraw = {
		kind: 'remote',
		rect,
		visible: true,
		label: peer.name,
		color: canvasFill(bar.paint.backgroundColor),
		flag
	};
	return { caret, nextMs: frame.nextMs };
}

/** every peer whose widget is in a block the frame placed; nothing depends on focus or a caret owner */
export function peerCaretsOf(
	model: DocumentModel,
	frame: PaintFrame,
	tools: PeerCaretTools
): { carets: PeerCaretDraw[]; nextMs: number | null } {
	const placed = new Set(frame.blocks.map((block) => block.index));
	const peers = frame.decorations.widgets.flatMap((widget) => {
		const form = widget.spec.canvas;
		return form?.kind === 'caret' && form.peer && model.count && placed.has(model.indexAt(widget.pos))
			? [{ pos: widget.pos, peer: form.peer, arrival: `${widget.key ?? ''}#${form.peer.arrival}` }]
			: [];
	});
	const elapsed = tools.arrivals.elapsed(peers.map((peer) => peer.arrival));
	const carets: PeerCaretDraw[] = [];
	let nextMs: number | null = null;
	peers.forEach((peer, i) => {
		const drawn = peerCaret(model, peer.pos, peer.peer, elapsed[i], tools);
		if (!drawn) return;
		carets.push(drawn.caret);
		if (drawn.nextMs !== null) nextMs = nextMs === null ? drawn.nextMs : Math.min(nextMs, drawn.nextMs);
	});
	return { carets, nextMs };
}

/** ctx maps doc space; the bar itself is drawn with the other carets */
export function paintPeerFlag(ctx: CanvasRenderingContext2D, flag: PeerFlagDraw): void {
	if (flag.opacity <= 0) return;
	const { x, y, width, height } = flag.rect;
	ctx.save();
	Object.assign(ctx, { globalAlpha: flag.opacity, fillStyle: flag.background });
	ctx.beginPath();
	ctx.roundRect(x, y, width, height, flag.radius);
	ctx.fill();
	Object.assign(ctx, { fillStyle: flag.color, font: flag.font, textBaseline: 'alphabetic' });
	ctx.fillText(flag.text, flag.textX, flag.baseline);
	ctx.restore();
}
