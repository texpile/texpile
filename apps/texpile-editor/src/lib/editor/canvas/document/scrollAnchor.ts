// the reading place (G14): what the reader looks at stays still while heights above it change, whatever changed them
import type { Mappable } from 'prosemirror-transform';
import type { BlockIndex } from './blockIndex';

/** doc y answers for the anchor, laying a block out on demand */
export type AnchorLocator = {
	indexAtY(y: number): number;
	blockTop(index: number): number;
	/** the first position of the line at doc y, null while the geometry answers nothing there */
	posAtY(y: number): number | null;
	/** the line holding pos, null while the geometry answers nothing there */
	lineOf(pos: number): { readonly top: number; readonly from: number } | null;
};

/** a line by its first position, or a block by its start; mapped through every edit until the next capture */
type ReadingPlace = { pos: number; readonly line: boolean; readonly assoc: -1 | 1 };
type CapturedPlace = { readonly place: ReadingPlace; readonly y: number; applied: number };

/** where scrollend never comes (Safari), a smooth scroll the app started ends by this */
const SMOOTH_SCROLL_MS = 1000;

export class ScrollAnchor {
	private viewport: CapturedPlace | null = null;
	private caret: CapturedPlace | null = null;
	private byUser = false;
	private forced: 'caret' | 'viewport' | null = null;
	private dragging = false;
	private smoothUntil = 0;

	constructor(
		private readonly index: BlockIndex,
		private readonly locate: AnchorLocator
	) {}

	/** at the end of a frame: the first visible line, and the caret's paragraph when the caret is on screen */
	capture(viewTop: number, caretOnScreen: number | null): void {
		// scrollTop holds whole pixels: what a shift left over is owed to the next one, or the page creeps
		const owed = this.owed();
		this.byUser = false;
		this.forced = null;
		if (!this.index.count) {
			this.viewport = this.caret = null;
			return;
		}
		const pos = this.locate.posAtY(viewTop);
		const viewport = pos === null ? { pos: this.index.blocks[this.locate.indexAtY(viewTop)].pos, line: false } : { pos, line: true };
		this.viewport = this.placeAt({ ...viewport, assoc: 1 }, owed);
		this.caret = caretOnScreen === null ? null : this.placeAt(this.caretPlace(caretOnScreen), owed);
	}

	/** a doc change: the user's own edit holds the caret's paragraph, anything else the first visible one; no mapping drops both */
	noteEdit(byUser: boolean, mapping: Mappable | null): void {
		this.byUser ||= byUser;
		if (!mapping) {
			this.viewport = this.caret = null;
			return;
		}
		if (this.viewport) this.viewport.place.pos = mapping.map(this.viewport.place.pos, this.viewport.place.assoc);
		if (!this.caret) return;
		const mapped = mapping.mapResult(this.caret.place.pos, this.caret.place.assoc);
		// a Backspace that joined the caret's paragraph onto the one above leaves the content above where it was
		if (mapped.deletedBefore) this.caret = null;
		else this.caret.place.pos = mapped.pos;
	}

	/** holdPosition: this place, whatever the edit, until the next capture */
	hold(place: 'caret' | 'viewport'): void {
		this.forced = place;
	}

	/** how far the held place moved since the capture and was not yet scrolled for, in doc px */
	shift(): number {
		const held = this.held();
		return held ? this.yOf(held.place) - held.y - held.applied : 0;
	}

	/** what the scroller really moved for shift(), after its rounding */
	scrolled(by: number): void {
		const held = this.held();
		if (held) held.applied += by;
	}

	/** the scroller moved by shift(), in CSS px at the zoom, and what its rounding left noted */
	scrollFor(scroller: HTMLElement, zoom: number): void {
		const shift = this.shift();
		if (!shift) return;
		const before = scroller.scrollTop;
		Object.assign(scroller, { scrollTop: before + shift * zoom });
		this.scrolled((scroller.scrollTop - before) / zoom);
	}

	/** the native scrollbar under the pointer: the reader moves the place */
	setDragging(dragging: boolean): void {
		this.dragging = dragging;
	}

	/** a smooth scroll the app started runs to its end unfought */
	smoothScrollStarted(): void {
		this.smoothUntil = performance.now() + SMOOTH_SCROLL_MS;
	}

	smoothScrollEnded(): void {
		this.smoothUntil = 0;
	}

	private held(): CapturedPlace | null {
		if (this.dragging || performance.now() < this.smoothUntil) return null;
		const caretHeld = this.forced ? this.forced === 'caret' : this.byUser;
		return caretHeld && this.caret ? this.caret : this.viewport;
	}

	/** under a pixel; a larger rest is the scroller's end stopping it, which nothing owes */
	private owed(): number {
		const rest = this.shift();
		return Math.abs(rest) < 1 ? rest : 0;
	}

	/** the first line of the caret's textblock: re-breaks move the caret's own line start, its paragraph's top stays */
	private caretPlace(head: number): ReadingPlace {
		const block = this.index.blocks[this.index.indexAt(head)];
		const inside = head - block.pos - 1;
		if (inside < 0 || inside > block.node.content.size) return { pos: block.pos, line: false, assoc: -1 };
		const $head = block.node.resolve(inside);
		for (let depth = $head.depth; depth >= 0; depth--)
			if ($head.node(depth).isTextblock) return { pos: block.pos + 1 + $head.start(depth), line: true, assoc: -1 };
		return { pos: block.pos, line: false, assoc: -1 };
	}

	private placeAt(place: ReadingPlace, owed: number): CapturedPlace {
		return { place, y: this.yOf(place) - owed, applied: 0 };
	}

	private yOf(place: ReadingPlace): number {
		const last = this.index.blocks[this.index.count - 1];
		const pos = Math.min(place.pos, last ? last.pos + last.node.nodeSize : 0);
		return (place.line ? this.locate.lineOf(pos)?.top : null) ?? this.locate.blockTop(this.index.indexAt(pos));
	}
}
