// the shade on a crossed inline element, stretched to its line box the way the browser paints selected text
import type { EditorView } from 'prosemirror-view';
import { contentBox, cssZoomOf, lineBoxesOf, middle, type LineBox } from '$lib/editor/visual/lineBoxes';

// off screen nobody sees the difference, and a select-all over a long paper would measure every formula in it
const NEAR_SCREEN = 600;

/** the editor's top-level blocks on or near the screen, found without reading every block's box */
function blocksNearScreen(root: HTMLElement): Element[] {
	const height = (root.ownerDocument.defaultView ?? window).innerHeight;
	const blocks = root.children;
	let from = 0;
	let end = blocks.length;
	while (from < end) {
		const mid = (from + end) >> 1;
		if (blocks[mid].getBoundingClientRect().bottom < -NEAR_SCREEN) from = mid + 1;
		else end = mid;
	}
	const near: Element[] = [];
	for (let i = from; i < blocks.length; i++) {
		const box = blocks[i].getBoundingClientRect();
		if (box.top > height + NEAR_SCREEN) break;
		if (box.bottom >= -NEAR_SCREEN) near.push(blocks[i]);
	}
	return near;
}

function blockOf(el: Element): HTMLElement | null {
	for (let up = el.parentElement; up; up = up.parentElement) {
		const display = getComputedStyle(up).display;
		if (!display.startsWith('inline') && display !== 'contents') return up;
	}
	return null;
}

// the hyphen of a selected word is painted by hand (hyphenSelection) and needs the same band
const BANDED = '.pm-range-node[data-band], .pm-line-hyphen-selected[data-band]';

/** one rule per crossed inline element on screen: how far its line reaches above and below it */
export function rangeBandRules(view: EditorView): string {
	const linesOf = new Map<HTMLElement, LineBox[]>();
	let rules = '';
	const crossed = blocksNearScreen(view.dom).flatMap((block) => [...block.querySelectorAll<HTMLElement>(BANDED)]);
	for (const el of crossed) {
		const outer = el.getClientRects()[0];
		if (!outer) continue;
		const style = getComputedStyle(el);
		if (!style.display.startsWith('inline')) continue;
		const zoom = cssZoomOf(el);
		// without the padding an earlier pass gave it
		const rect = contentBox(outer, style, zoom);
		const block = blockOf(el);
		if (!block) continue;
		let lines = linesOf.get(block);
		if (!lines) linesOf.set(block, (lines = lineBoxesOf(block)));
		const at = middle(rect);
		const line = lines.find((l) => at > l.top && at < l.bottom);
		if (!line) continue;
		const up = Math.max(0, rect.top - line.top) / zoom;
		const down = Math.max(0, line.bottom - rect.bottom) / zoom;
		rules += `[data-band="${el.dataset.band}"]{--band-up:${up.toFixed(4)}px;--band-down:${down.toFixed(4)}px}`;
	}
	return rules;
}

// how far a line box reaches above and below the text on it, as shares of the font size. an inline
// box's background covers the font's ascent and descent, not the 1em it asked for, so padding worked
// out from 1em ran every line's shade into the next one's, a darker strip at each join; and the browser
// splits the leading unevenly, so halving it left a one pixel seam. measured on a line of its own at
// the paragraph's size and spacing, which the browser lays out the same way to the last layout unit
function textReachRule(view: EditorView): string {
	const paragraph = view.dom.querySelector(':scope > p');
	if (!paragraph) return '';
	const font = getComputedStyle(paragraph);
	const size = parseFloat(font.fontSize);
	if (!font.fontFamily || !(size > 0)) return '';
	const line = view.dom.ownerDocument.body.appendChild(document.createElement('div'));
	line.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;margin:0;padding:0;border:0';
	for (const name of ['fontFamily', 'fontWeight', 'fontStyle', 'fontSize', 'lineHeight'] as const) line.style[name] = font[name];
	const text = line.appendChild(document.createElement('span'));
	text.textContent = 'x';
	const zoom = cssZoomOf(text);
	const outer = line.getBoundingClientRect();
	const inner = text.getBoundingClientRect();
	line.remove();
	const up = (inner.top - outer.top) / zoom / size;
	const down = (outer.bottom - inner.bottom) / zoom / size;
	const area = inner.height / zoom / size;
	if (!(up >= 0 && down >= 0 && area > 0)) return '';
	// the text's own height and how far off centre the browser set it, so text at another size or
	// spacing (a heading) still centres on its own line box
	return `.ProseMirror{--text-area:${area.toFixed(6)}em;--text-skew:${((up - down) / 2).toFixed(6)}em}`;
}

export type RangeBandPainter = { repaint(): void; destroy(): void };

/** keeps the rules in step with the selection, the scroll position and the editor's width */
export function rangeBandPainter(view: EditorView): RangeBandPainter {
	// in the editor's own document, which may be a window of its own
	const doc = view.dom.ownerDocument;
	const win = doc.defaultView ?? window;
	const style = doc.head.appendChild(document.createElement('style'));
	const metric = doc.head.appendChild(document.createElement('style'));
	let measured = false;
	function measureText(): void {
		if (view.isDestroyed) return;
		metric.textContent = textReachRule(view);
		measured = metric.textContent !== '';
	}
	// not before the view is on the page, where it has no font yet; again when a font arrives or the theme changes it
	const firstMeasure = requestAnimationFrame(measureText);
	doc.fonts?.addEventListener('loadingdone', measureText);
	const themed = new MutationObserver(measureText);
	themed.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
	let frame = 0;
	function paint(): void {
		frame = 0;
		const rules = view.isDestroyed ? '' : rangeBandRules(view);
		if (rules !== style.textContent) style.textContent = rules;
	}
	function repaint(): void {
		// a document opened with no paragraph yet is measured when one arrives
		if (!measured) measureText();
		// a thread's or a peer's bands with no selection of our own still have to be measured
		if (!frame && (style.textContent || view.dom.querySelector(BANDED))) frame = requestAnimationFrame(paint);
	}
	win.addEventListener('scroll', repaint, { capture: true, passive: true });
	const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(repaint);
	resized?.observe(view.dom);
	return {
		repaint,
		destroy() {
			if (frame) cancelAnimationFrame(frame);
			cancelAnimationFrame(firstMeasure);
			win.removeEventListener('scroll', repaint, { capture: true });
			doc.fonts?.removeEventListener('loadingdone', measureText);
			themed.disconnect();
			resized?.disconnect();
			style.remove();
			metric.remove();
		}
	};
}
