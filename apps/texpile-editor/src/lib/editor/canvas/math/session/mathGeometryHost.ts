// the session's layout placed where the canvas drew its formula: MathLive's geometry questions answered from it (13.5)
import type { MathCaretPoint, MathFieldRect, MathGeometry, MathLayout, MathRect } from 'mathlive';
import type { ReplacedHit } from '../../contracts/faceTypes';
import type { DocRect } from '../../contracts/layoutTypes';
import type { VisualView } from '../../contracts/viewTypes';
import { FORMULA_PART, type FormulaPlacing } from '../mathReplaced';

/** where the formula stands in doc space: its content box, px per em and its baseline */
export type FormulaPlace = { readonly rect: DocRect; readonly size: number; readonly baseline: number };

// the live field's content padding (left, top, right, bottom) and its border with the container's padding around it
// (mathfield.less, document.css): MathLive measured its selection from the padded box and took presses in the outer one
const DISPLAY_PADDING = [1, 2, 3, 2];
const DISPLAY_FRAME = 5;
const INLINE_FIELD_BORDER = 1;

function grown(rect: DocRect, [left, top, right, bottom]: readonly number[]): DocRect {
	return { x: rect.x - left, y: rect.y - top, width: rect.width + left + right, height: rect.height + top + bottom };
}

export type GeometryHostParts = {
	readonly view: VisualView;
	pos(): number;
	display(): boolean;
	layout(): MathLayout;
	placing(): FormulaPlacing;
	scrollX(): number;
	scrollBy(dx: number): void;
};

/** the formula's caret as MathLive's .ML__caret span stands: from the caret box's top to its bottom, at its right edge */
export type MathCaretBox = { x: number; top: number; bottom: number };

function sideRect(left: number, top: number, right: number, bottom: number): MathFieldRect {
	return { left, top, right, bottom };
}

/** the live field's box around a formula, client px: a press inside it enters the formula */
export function formulaFieldRect(view: VisualView, pos: number, display: boolean): DOMRect | null {
	const rect = view.canvas.geometry.partRect(pos, FORMULA_PART);
	if (!rect) return null;
	if (display)
		return view.canvas.clientRect(grown(grown(rect, DISPLAY_PADDING), [DISPLAY_FRAME, DISPLAY_FRAME, DISPLAY_FRAME, DISPLAY_FRAME]));
	const line = view.canvas.geometry.lineOf({ pos, affinity: 1 });
	const top = Math.min(rect.y, line?.top ?? rect.y);
	const bottom = Math.max(rect.y + rect.height, line?.bottom ?? rect.y + rect.height) + INLINE_FIELD_BORDER * 2;
	return view.canvas.clientRect({
		x: rect.x - INLINE_FIELD_BORDER,
		y: top,
		width: rect.width + INLINE_FIELD_BORDER * 2,
		height: bottom - top
	});
}

export class MathGeometryHost implements MathGeometry {
	constructor(private readonly parts: GeometryHostParts) {}

	/** null while the formula's block is not laid out */
	place(): FormulaPlace | null {
		const { view } = this.parts;
		const placing = this.parts.placing();
		const rect = view.canvas.geometry.partRect(this.parts.pos(), FORMULA_PART);
		if (!rect) return null;
		return { rect, size: placing.size, baseline: rect.y + placing.ascent };
	}

	/** an em rect of the layout in doc space, with the display's sideways scroll */
	docRectOf(rect: MathRect, place: FormulaPlace): DocRect {
		return {
			x: place.rect.x + rect.x * place.size - this.parts.scrollX(),
			y: place.baseline + rect.y * place.size,
			width: rect.width * place.size,
			height: rect.height * place.size
		};
	}

	/** the smallest atom under a point of the formula's content box; the formula itself between atoms */
	hit(x: number, y: number): ReplacedHit | null {
		const place = this.place();
		if (!place || x < 0 || y < 0 || x > place.rect.width || y > place.rect.height) return null;
		const at = { x: place.rect.x + x, y: place.rect.y + y };
		let found: ReplacedHit = { part: FORMULA_PART, rect: place.rect };
		let area = Infinity;
		for (const [id, atom] of this.parts.layout().atoms) {
			const rect = this.docRectOf(atom, place);
			const inside = at.x >= rect.x && at.x <= rect.x + rect.width && at.y >= rect.y && at.y <= rect.y + rect.height;
			if (inside && rect.width * rect.height < area) {
				area = rect.width * rect.height;
				found = { part: id, rect };
			}
		}
		return found;
	}

	caretBox(): MathCaretBox | null {
		const caret = this.parts.layout().caret;
		const place = this.place();
		if (!caret || !place) return null;
		return {
			x: place.rect.x + caret.x * place.size - this.parts.scrollX(),
			top: place.baseline + caret.top * place.size,
			bottom: place.baseline + caret.bottom * place.size
		};
	}

	private client(rect: DocRect): MathFieldRect {
		const box = this.parts.view.canvas.clientRect(rect);
		return sideRect(box.left, box.top, box.right, box.bottom);
	}

	atomRect(id: string): MathFieldRect | null {
		const atom = this.parts.layout().atoms.get(id);
		const place = this.place();
		if (!atom || !place) return null;
		const rect = this.client(this.docRectOf(atom, place));
		// getNodeBounds measured a DOM box one px up and its right edge one px in
		return sideRect(rect.left, rect.top - 1, rect.right - 1, rect.bottom - 1);
	}

	/** whole px, as offsetLeft and offsetWidth gave them link by link up the markup's offsetParent chain: a vertical move
	 * lands by ties between atoms a fraction apart */
	atomOffsetRect(id: string): MathFieldRect | null {
		const layout = this.parts.layout();
		const atom = layout.atoms.get(id);
		const size = this.parts.placing().size;
		if (!atom) return null;
		let left = 0;
		let from = 0;
		for (const origin of layout.atomOffsets?.get(id) ?? [atom.x]) {
			left += Math.round((origin - from) * size);
			from = origin;
		}
		const top = Math.round(atom.y * size);
		return sideRect(left, top, left + Math.round(atom.width * size), top + Math.round(atom.height * size));
	}

	caretPoint(): MathCaretPoint | null {
		const caret = this.caretBox();
		if (!caret) return null;
		const rect = this.client({ x: caret.x, y: caret.top, width: 0, height: caret.bottom - caret.top });
		return { x: rect.right, y: rect.bottom, height: rect.bottom - rect.top };
	}

	contentRect(): MathFieldRect {
		const place = this.place();
		return place ? this.client(place.rect) : sideRect(0, 0, 0, 0);
	}

	/** what the field shows: MathLive scrolls the caret into it */
	fieldRect(): MathFieldRect {
		const place = this.place();
		return place ? this.client(this.visibleDocRect(place)) : sideRect(0, 0, 0, 0);
	}

	/** the padded box selection rects are measured from, doc space */
	fieldDocRect(place: FormulaPlace): DocRect {
		return this.parts.display() ? grown(place.rect, DISPLAY_PADDING) : place.rect;
	}

	/** E8: a display wider than its block shows up to the block's right edge, where the layout clips it */
	visibleDocRect(place: FormulaPlace): DocRect {
		const field = this.fieldDocRect(place);
		const block = this.parts.display() ? this.parts.view.canvas.geometry.nodeRect(this.parts.pos())?.rect : null;
		if (!block) return field;
		return { ...field, width: Math.max(0, Math.min(field.x + field.width, block.x + block.width) - field.x) };
	}

	/** where the live field stood: a press there entered the formula, clamped to its content */
	hostRect(): MathFieldRect {
		const { view } = this.parts;
		const box = formulaFieldRect(view, this.parts.pos(), this.parts.display());
		return box ? sideRect(box.left, box.top, box.right, box.bottom) : sideRect(0, 0, 0, 0);
	}

	get scale(): number {
		const place = this.place();
		if (!place || !place.rect.width) return 1;
		return this.parts.view.canvas.clientRect(place.rect).width / place.rect.width;
	}

	get scrollX(): number {
		return this.parts.scrollX();
	}

	scrollBy(dx: number): void {
		this.parts.scrollBy(dx);
	}
}
