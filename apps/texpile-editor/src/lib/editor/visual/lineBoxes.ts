// the line boxes of a block of inline content, as the browser stacks them
export type LineBox = { top: number; bottom: number };

const REPLACED = new Set(['IMG', 'SVG', 'CANVAS', 'VIDEO', 'IFRAME', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']);

function within(y: number, box: LineBox): boolean {
	return y > box.top && y < box.bottom;
}

export function middle(box: LineBox): number {
	return (box.top + box.bottom) / 2;
}

/** boxes that share a line: a tall formula and the words beside it overlap, two lines do not */
export function linesFromBoxes(boxes: LineBox[]): LineBox[] {
	const lines: LineBox[] = [];
	for (const box of [...boxes].sort((a, b) => a.top - b.top)) {
		const line = lines[lines.length - 1];
		if (line && (within(middle(box), line) || within(middle(line), box))) {
			line.top = Math.min(line.top, box.top);
			line.bottom = Math.max(line.bottom, box.bottom);
		} else lines.push({ top: box.top, bottom: box.bottom });
	}
	return lines;
}

export function lineIndexAt(lines: LineBox[], box: LineBox): number {
	const y = middle(box);
	let nearest = 0;
	let gap = Infinity;
	lines.forEach((line, i) => {
		const d = within(y, line) ? 0 : Math.min(Math.abs(y - line.top), Math.abs(y - line.bottom));
		if (d < gap) [nearest, gap] = [i, d];
	});
	return nearest;
}

// client rects come zoomed, computed lengths do not
export function cssZoomOf(el: Element): number {
	return (el as Element & { currentCSSZoom?: number }).currentCSSZoom ?? 1;
}

function lengths(zoom: number, ...values: string[]): number {
	return values.reduce((sum, v) => sum + (parseFloat(v) || 0), 0) * zoom;
}

/** an element's box without its vertical padding and border, which paint but take no part in the line */
export function contentBox(rect: DOMRect, style: CSSStyleDeclaration, zoom: number): LineBox {
	return {
		top: rect.top + lengths(zoom, style.paddingTop, style.borderTopWidth),
		bottom: rect.bottom - lengths(zoom, style.paddingBottom, style.borderBottomWidth)
	};
}

/**
 * What an inline box adds to its line: its content area and the leading around it. Chrome lays out in
 * device pixels and floors the leading above the text, the rest goes below; an even split is off by
 * a fraction of a pixel, which shows as a seam beside the selection the browser paints.
 */
function withLeading(rect: LineBox, style: CSSStyleDeclaration, zoom: number): LineBox {
	const unit = window.devicePixelRatio || 1;
	const leading = parseFloat(style.lineHeight) * zoom * unit - (rect.bottom - rect.top) * unit;
	if (!Number.isFinite(leading)) return rect;
	const above = Math.floor(leading / 2);
	return { top: rect.top - above / unit, bottom: rect.bottom + (leading - above) / unit };
}

function marginBox(el: Element, style: CSSStyleDeclaration, zoom: number): LineBox {
	const rect = el.getBoundingClientRect();
	return { top: rect.top - lengths(zoom, style.marginTop), bottom: rect.bottom + lengths(zoom, style.marginBottom) };
}

function inlineBoxes(block: HTMLElement): LineBox[] {
	const boxes: LineBox[] = [];
	const zoom = cssZoomOf(block);
	const range = document.createRange();
	function visit(parent: Element, style: CSSStyleDeclaration): void {
		for (const child of parent.childNodes) {
			if (child.nodeType === Node.TEXT_NODE) {
				range.selectNodeContents(child);
				for (const rect of range.getClientRects()) if (rect.width > 0 && rect.height > 0) boxes.push(withLeading(rect, style, zoom));
			} else if (child instanceof Element) {
				const own = getComputedStyle(child);
				if (own.display === 'none' || own.position === 'absolute' || own.position === 'fixed' || own.float !== 'none') continue;
				if (own.display === 'contents') visit(child, style);
				else if (own.display === 'inline' && !REPLACED.has(child.tagName.toUpperCase())) {
					for (const rect of child.getClientRects()) if (rect.height > 0) boxes.push(withLeading(contentBox(rect, own, zoom), own, zoom));
					visit(child, own);
				} else boxes.push(marginBox(child, own, zoom));
			}
		}
	}
	visit(block, getComputedStyle(block));
	return boxes.filter((box) => box.bottom > box.top);
}

export function lineBoxesOf(block: HTMLElement): LineBox[] {
	return linesFromBoxes(inlineBoxes(block));
}

export function contentWidth(block: HTMLElement): number {
	const style = getComputedStyle(block);
	const box = block.getBoundingClientRect().width / cssZoomOf(block);
	return box - lengths(1, style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth);
}
