// a Contents row glides the editor to its heading, so the reader sees where the jump went. The jumps that put the
// reader back where they were (a switch of mode, a file reopened, a pane shut) land at once instead
import { EditorView as CMView } from '@codemirror/view';
import type { EditorView as PMView } from 'prosemirror-view';
import { scrollParent } from '$lib/editor/visual/scrollParent';

/** room left above the heading, as the source editor's own scrollIntoView margin */
const MARGIN = 20;

/** smooth to where `to` says, then exact: lines not drawn yet were only estimated when the glide set off */
function glide(scroller: HTMLElement, to: () => number): void {
	// a heading near either end cannot reach the top, and a scroll that cannot move fires no scrollend
	function target() {
		return Math.max(0, Math.min(to(), scroller.scrollHeight - scroller.clientHeight));
	}
	function settle() {
		const top = target();
		if (Math.abs(scroller.scrollTop - top) > 1) scroller.scrollTo({ top });
	}
	const top = target();
	// already there, there is no scroll to end; nor any glide for a reader who asked for less motion
	if (Math.abs(scroller.scrollTop - top) <= 1 || matchMedia('(prefers-reduced-motion: reduce)').matches) return settle();
	const done = new AbortController();
	function landed() {
		done.abort();
		settle();
	}
	scroller.addEventListener('scrollend', landed, { once: true, signal: done.signal });
	// the reader scrolling on their own takes over: the end of their scroll is not the glide's to correct
	for (const type of ['wheel', 'pointerdown', 'keydown'] as const)
		scroller.addEventListener(type, () => done.abort(), { once: true, signal: done.signal });
	scroller.scrollTo({ top, behavior: 'smooth' });
}

export function glideVisualTo(view: PMView, pos: number): void {
	const scroller = scrollParent(view.dom);
	if (!scroller) return;
	glide(scroller, () => {
		const dom = view.nodeDOM(pos);
		if (!(dom instanceof HTMLElement)) return scroller.scrollTop;
		return dom.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - MARGIN;
	});
}

export function glideSourceTo(view: CMView, pos: number): void {
	const scroller = view.scrollDOM;
	glide(scroller, () => {
		const docTop = view.documentTop - scroller.getBoundingClientRect().top + scroller.scrollTop;
		return docTop + view.lineBlockAt(pos).top - MARGIN;
	});
}
