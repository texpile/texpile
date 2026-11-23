// which selection changes scroll the pane, and how far: clear of the floating format bar and the foot (10.6)
import { NodeSelection, type EditorState, type Transaction } from 'prosemirror-state';
import { GapCursor } from 'prosemirror-gapcursor';
import type { EditorView } from 'prosemirror-view';
import { PAGE_KEY_META } from '../contracts/geometryTypes';
import type { DocRect } from '../contracts/layoutTypes';
import type { VisualView } from '../contracts/viewTypes';
import { gapEdgeOf } from '../paint/caretLayer';
import { scrollBoxBy } from '../interaction/pointer/sideScroll';

export type RevealHost = {
	readonly view: Pick<VisualView, 'state' | 'canvas' | 'dom'>;
	/** what handleScrollToSelection receives */
	readonly exposed: EditorView;
	/** the frame loop: a smooth scroll runs to its end without the reading place fighting it, and a reveal repeated asks for its frame */
	frames(): { readonly anchor: { smoothScrollStarted(): void }; requestFrame(): void };
};

// keyed: a key moved the head (a margin of lines kept); edge: shown at the band's edges; nudged: an edit moved it
type RevealMode = 'keyed' | 'edge' | 'nudged';
type ScrollCounted = EditorState & { scrollToSelection?: number };
type ScrollMarginProp = number | { top: number; right: number; bottom: number; left: number };

const KEY_WINDOW_MS = 500;
const EDGE = 5;
/** a caret this far under the foot that no key moved is one an edit nudged there; further down the reader scrolled away */
const BELOW = 48;
const GAP_BAR = 2;
/** frames a keyed reveal repeats while its caret's place is still estimated from blocks never laid out */
const REVEAL_RETRIES = 4;
const MARGIN_LINES = 3;
const MARGIN_SHARE = 0.2;
const SIDE_MARGIN = 12;

function scrollCount(state: EditorState): number {
	return (state as ScrollCounted).scrollToSelection ?? 0;
}

/** a gap cursor landing beside the block the caret just left stays where the reader is looking */
function landsBesideLeftBlock(prev: EditorState, state: EditorState): boolean {
	if (!(state.selection instanceof GapCursor)) return false;
	const { $head } = prev.selection;
	if ($head.depth === 0) return false;
	const at = state.selection.head;
	return at === $head.before(1) || at === $head.after(1);
}

export class RevealPolicy {
	private lastKey = -Infinity;
	private pending: RevealMode | null = null;
	private retries = 0;

	constructor(private readonly host: RevealHost) {}

	noteKey(): void {
		this.lastKey = performance.now();
	}

	/** an edit now is the writer's own: a key or typed text came just before it */
	keyedRecently(): boolean {
		return performance.now() - this.lastKey < KEY_WINDOW_MS;
	}

	/** after an update: scrollIntoView asks; a selection a key moved always reveals, any other only when nudged off the band */
	afterUpdate(prev: EditorState, state: EditorState, tr: Transaction | null = null): void {
		if (tr?.getMeta(PAGE_KEY_META)) {
			this.pending = null;
			return;
		}
		if (scrollCount(state) > scrollCount(prev)) this.pending = 'keyed';
		else if (!state.selection.eq(prev.selection) && !landsBesideLeftBlock(prev, state))
			this.pending = this.pending === 'keyed' || performance.now() - this.lastKey < KEY_WINDOW_MS ? 'keyed' : 'nudged';
	}

	/** prosemirror-view's scrollToSelection: the prop first, then the canvas's reveal of the head */
	scrollToSelection(): void {
		if (this.handledByProp()) return;
		this.reveal(this.headRect(), 'keyed');
		this.revealSideways();
	}

	/** in the frame, once the head's block is laid out; a head placed from estimates is revealed again as the blocks above it are measured */
	run(): void {
		const mode = this.pending;
		this.pending = null;
		if (!mode || (mode === 'keyed' && this.handledByProp())) return;
		this.reveal(this.headRect(), mode);
		this.revealSideways();
		if (mode === 'nudged' || !this.headEstimated()) this.retries = 0;
		else if (this.retries++ < REVEAL_RETRIES) {
			this.pending = mode;
			this.host.frames().requestFrame();
		} else this.retries = 0;
	}

	private headEstimated(): boolean {
		const { head } = this.host.view.state.selection;
		return this.host.view.canvas.geometry.rangeTop(head).estimated;
	}

	revealPos(pos: number, mode: 'nearest' | 'center' | 'start', behavior: 'auto' | 'smooth' = 'auto'): void {
		const { geometry } = this.host.view.canvas;
		const rect = geometry.caretRect({ pos, affinity: 1 }) ?? geometry.nodeRect(pos)?.rect ?? null;
		if (!rect) return;
		if (mode === 'nearest') {
			this.reveal(rect, 'edge', behavior);
			return;
		}
		const box = this.host.view.canvas.clientRect(rect);
		const band = this.band();
		const target = mode === 'center' ? (band.top + band.bottom) / 2 - (box.top + box.bottom) / 2 : band.top - box.top;
		this.scrollBy(-target, behavior);
	}

	private handledByProp(): boolean {
		const { exposed } = this.host;
		return !!exposed.someProp('handleScrollToSelection', (f) => f(exposed));
	}

	private headRect(): DocRect | null {
		const { view } = this.host;
		const { geometry } = view.canvas;
		const owned = view.canvas.nested()?.caretRect();
		if (owned) return owned;
		const { selection } = view.state;
		if (selection instanceof NodeSelection) return geometry.nodeRect(selection.from)?.rect ?? null;
		if (selection instanceof GapCursor) {
			const edge = gapEdgeOf(selection, geometry);
			return edge && { ...edge, width: 0, height: GAP_BAR };
		}
		return geometry.caretRect(view.canvas.head());
	}

	/** the scroller's client box, under the floating format bar and above the foot, with the scrollMargin prop */
	private band(): { top: number; bottom: number; area: DOMRect; bar: DOMRect | null } {
		const { view, exposed } = this.host;
		const scroller = view.canvas.scroller;
		const area = scroller.getBoundingClientRect();
		const margin = exposed.someProp('scrollMargin') as ScrollMarginProp | undefined;
		const [above, below] = typeof margin === 'object' ? [margin.top, margin.bottom] : [margin ?? EDGE, margin ?? EDGE];
		const bar = view.dom.closest('.floating-bar-room')?.querySelector('[data-format-bar]')?.getBoundingClientRect() ?? null;
		return { top: (bar?.bottom ?? area.top) + above, bottom: area.top + scroller.clientTop + scroller.clientHeight - below, area, bar };
	}

	/** three caret lines under the bar and above the foot, at most a fifth of the band, so a short pane still works */
	private keptMargin(lineHeight: number, band: { top: number; bottom: number }): number {
		return Math.min(MARGIN_LINES * lineHeight, (band.bottom - band.top) * MARGIN_SHARE);
	}

	private reveal(rect: DocRect | null, mode: RevealMode, behavior: 'auto' | 'smooth' = 'auto'): void {
		if (!rect) return;
		const band = this.band();
		const box = this.host.view.canvas.clientRect(rect);
		const height = Math.min(box.height, band.bottom - band.top);
		const keyed = mode !== 'nudged';
		const margin = mode === 'keyed' ? this.keptMargin(box.height, band) : 0;
		const top = band.top + (band.bar ? margin : 0);
		const bottom = band.bottom - margin;
		if (box.top < top && (keyed || (band.bar && box.bottom > band.area.top))) this.scrollBy(box.top - top, behavior);
		else if (box.top + height > bottom && (keyed || box.top < band.bottom + BELOW)) this.scrollBy(box.top + height - bottom, behavior);
	}

	/** a head in a box that scrolls sideways (a wide table) is scrolled into the box's view */
	private revealSideways(): void {
		const { geometry } = this.host.view.canvas;
		const { head } = this.host.view.state.selection;
		const box = geometry.scrollBoxOf(head);
		const rect = box && this.headRect();
		if (!box || !rect) return;
		const left = box.rect.x + SIDE_MARGIN;
		const right = box.rect.x + box.rect.width - SIDE_MARGIN;
		const end = rect.x + rect.width;
		const dx = rect.x < left ? rect.x - left : end > right ? Math.min(end - right, rect.x - left) : 0;
		if (dx && scrollBoxBy(box, dx)) this.host.frames().requestFrame();
	}

	private scrollBy(delta: number, behavior: 'auto' | 'smooth'): void {
		const scroller = this.host.view.canvas.scroller;
		if (behavior === 'smooth') {
			this.host.frames().anchor.smoothScrollStarted();
			scroller.scrollTo({ top: scroller.scrollTop + delta, behavior });
		} else scroller.scrollTop += delta;
	}
}
