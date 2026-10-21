// painted with the CSS Custom Highlight API: a span per match made ProseMirror rebuild formulas and the lines move
import type { EditorView } from 'prosemirror-view';
import type { FindMatch } from './findMatches';

const MATCH = 'find-match';
const CURRENT = 'find-current';
/** on a match drawn in a shadow tree (a formula), which a highlight cannot reach */
export const FIND_ATTR = 'data-find';

type HighlightWindow = Window & { CSS: { highlights?: Map<string, unknown> }; Highlight?: new (...ranges: Range[]) => unknown };

const marked = new WeakMap<EditorView, Set<HTMLElement>>();

function rangeOf(view: EditorView, match: FindMatch): Range | null {
	const doc = view.dom.ownerDocument;
	try {
		if (match.kind === 'unit') {
			const dom = view.nodeDOM(match.from);
			if (!(dom instanceof doc.defaultView!.HTMLElement) || !dom.textContent) return null;
			const range = doc.createRange();
			range.selectNodeContents(dom);
			return range;
		}
		const start = view.domAtPos(match.from);
		const end = view.domAtPos(match.to);
		const range = doc.createRange();
		range.setStart(start.node, start.offset);
		range.setEnd(end.node, end.offset);
		return range;
	} catch {
		return null;
	}
}

function unitElement(view: EditorView, match: FindMatch): HTMLElement | null {
	if (match.kind !== 'unit' || !match.node.type.name.includes('math')) return null;
	const dom = view.nodeDOM(match.from);
	return dom instanceof view.dom.ownerDocument.defaultView!.HTMLElement ? dom : null;
}

export function paintFindHighlights(view: EditorView, matches: readonly FindMatch[], current: number): void {
	const win = view.dom.ownerDocument.defaultView as HighlightWindow | null;
	const highlights = win?.CSS.highlights;
	const before = marked.get(view) ?? new Set<HTMLElement>();
	const now = new Set<HTMLElement>();
	const ranges: Range[] = [];
	let currentRange: Range | null = null;
	for (const [i, match] of matches.entries()) {
		const element = unitElement(view, match);
		if (element) {
			element.setAttribute(FIND_ATTR, i === current ? 'current' : 'match');
			now.add(element);
			continue;
		}
		const range = rangeOf(view, match);
		if (!range) continue;
		if (i === current) currentRange = range;
		else ranges.push(range);
	}
	for (const element of before) if (!now.has(element)) element.removeAttribute(FIND_ATTR);
	marked.set(view, now);
	if (!highlights || !win?.Highlight) return;
	highlights.set(MATCH, new win.Highlight(...ranges));
	highlights.set(CURRENT, new win.Highlight(...(currentRange ? [currentRange] : [])));
}

export function clearFindHighlights(view: EditorView): void {
	paintFindHighlights(view, [], -1);
	const win = view.dom.ownerDocument.defaultView as HighlightWindow | null;
	win?.CSS.highlights?.delete(MATCH);
	win?.CSS.highlights?.delete(CURRENT);
}
