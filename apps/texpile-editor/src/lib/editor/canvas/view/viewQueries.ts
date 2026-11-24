// the position and element questions of prosemirror-view, answered from the layout and the element trees (2.2, 7.3)
import type { EditorState } from 'prosemirror-state';
import { GapCursor } from 'prosemirror-gapcursor';
import type { TextblockDirection, ViewNodeRef, VisualView } from '../contracts/viewTypes';
import type { DocRect } from '../contracts/layoutTypes';
import type { BlockAction } from '../contracts/faceTypes';
import type { BlockElements } from '../document/blockElements';
import type { BlockIndex } from '../document/blockIndex';
import type { ViewDocument } from '../document/viewDocument';
import { FaceElement, FaceText, type FaceChild } from '../tree/faceElement';
import { inlineHitRange } from '../tree/inlineHitChain';
import { descAt, NodeViewDesc } from '../tree/nodeViewDesc';
import { gapEdgeOf } from '../paint/caretLayer';

export type ViewQueryHost = {
	readonly view: Pick<VisualView, 'state' | 'canvas'>;
	readonly dom: HTMLElement;
	readonly index: BlockIndex;
	readonly elements: BlockElements;
	readonly model: ViewDocument;
	selectedPos(): number | null;
};

type ClientCoords = { left: number; right: number; top: number; bottom: number };

function placeRect(host: ViewQueryHost, pos: number, side: number): DocRect {
	if (host.index.count) host.model.layout(host.index.indexAt(pos));
	const { geometry } = host.view.canvas;
	const caret = geometry.caretRect({ pos, affinity: side < 0 ? -1 : 1 });
	if (caret) return caret;
	// prosemirror-view read the gap cursor's own widget there, which stood in the parent's flow
	const { selection } = host.view.state;
	const gap = selection instanceof GapCursor && selection.head === pos ? gapEdgeOf(selection, geometry) : null;
	if (gap) return { x: gap.x, y: gap.y, width: 0, height: 0 };
	const node = geometry.nodeRect(pos)?.rect;
	if (node) return { ...node, width: 0, x: side < 0 ? node.x + node.width : node.x };
	const index = host.index.indexAt(pos);
	const atEnd = pos >= (host.index.blocks[index]?.pos ?? 0) + (host.index.blocks[index]?.node.nodeSize ?? 0);
	const y = atEnd ? host.model.top(index).y + (host.model.cached(index)?.height ?? 0) : host.model.top(index).y;
	return { x: 0, y, width: 0, height: 0 };
}

/** a flat caret rect in client px (left === right); a block never laid out is laid out first, so it is never (0, 0) */
export function coordsAtPos(host: ViewQueryHost, pos: number, side = 1): ClientCoords {
	const rect = host.view.canvas.clientRect(placeRect(host, pos, side));
	return { left: rect.left, right: rect.left, top: rect.top, bottom: rect.bottom };
}

/** prosemirror-view's pos and inside for a client point; null outside the root's box */
export function posAtCoords(host: ViewQueryHost, coords: { left: number; top: number }): { pos: number; inside: number } | null {
	const box = host.dom.getBoundingClientRect();
	if (coords.left < box.left || coords.left > box.right || coords.top < box.top || coords.top > box.bottom) return null;
	const { canvas } = host.view;
	const hit = canvas.geometry.hit(canvas.docPoint({ x: coords.left, y: coords.top }));
	return hit ? { pos: hit.pos, inside: hit.inside } : null;
}

export function endOfTextblock(host: ViewQueryHost, dir: TextblockDirection, state?: EditorState): boolean {
	return host.view.canvas.geometry.endOfTextblock(dir, state ?? host.view.state);
}

function unitAtPos(host: ViewQueryHost, pos: number): NodeViewDesc | null {
	if (!host.index.count) return null;
	const entry = host.index.blocks[host.index.indexAt(pos)];
	return descAt(host.elements.sync(entry, host.selectedPos()), pos - entry.pos);
}

export function blockActionsAt(host: ViewQueryHost, pos: number): readonly BlockAction[] {
	return unitAtPos(host, pos)?.spec?.actions?.() ?? [];
}

/** the face root of the node starting at pos, its block laid out so getBoundingClientRect answers */
export function faceRootAt(host: ViewQueryHost, pos: number): FaceElement | null {
	const unit = unitAtPos(host, pos);
	if (unit) host.model.layout(host.index.indexAt(pos));
	return unit?.nodeDOM ?? null;
}

/** the deepest element whose hole holds pos, and how many of the hole's children come before it */
export function domAtPos(host: ViewQueryHost, pos: number): { node: FaceElement; offset: number } {
	let unit = unitAtPos(host, host.index.blocks[host.index.indexAt(pos)]?.pos ?? 0);
	if (!unit) throw new RangeError(`no block holds ${pos}`);
	for (;;) {
		const start = unit.pos() + 1;
		const inside: NodeViewDesc | undefined = unit.children.find(
			(child): child is NodeViewDesc =>
				child instanceof NodeViewDesc &&
				!!child.contentDOM &&
				start + child.offset < pos &&
				pos < start + child.offset + child.node.nodeSize
		);
		if (!inside) break;
		unit = inside;
	}
	const hole = unit.contentDOM ?? unit.nodeDOM;
	const start = unit.pos() + 1;
	const before = unit.children.filter((child) =>
		child instanceof NodeViewDesc ? start + child.offset + child.node.nodeSize <= pos : !!child.dom && child.widget.pos < pos
	);
	const marker = hole.firstChild instanceof FaceText ? 1 : 0;
	return { node: hole, offset: marker + before.filter((child) => child.dom).length };
}

/** whether a precedes b in document order inside one face tree */
function precedes(root: FaceElement, a: FaceChild, b: FaceChild): boolean {
	const stack: FaceChild[] = [root];
	for (let at = stack.pop(); at; at = stack.pop()) {
		if (at === a) return true;
		if (at === b) return false;
		if (at instanceof FaceElement) stack.push(...[...at.childNodes].reverse());
	}
	return false;
}

/** prosemirror-view's posFromDOM over face trees: inside a hole by its children, outside by which side of the hole */
export function posAtFace(host: ViewQueryHost, node: ViewNodeRef, offset: number, bias = -1): number {
	const el = node instanceof FaceText ? node.parentNode : node instanceof FaceElement ? node : null;
	if (!el) throw new RangeError('posAtDOM takes a node of a face tree');
	const run = inlineHitRange(el);
	if (run) return bias > 0 || offset > 0 ? run.to : run.from;
	const entry = host.elements.entryOfRoot(el);
	if (!entry) throw new RangeError('the element is not in a laid-out block');
	const positions = host.elements.positions(entry, host.selectedPos());
	const owner = positions.ownerOf(el);
	if (!owner) return entry.pos;
	const before = entry.pos + (positions.posOf(owner.nodeDOM) ?? 0);
	const border = owner.node.isLeaf ? 0 : 1;
	const atStart = before + border;
	const atEnd = before + owner.node.nodeSize - border;
	if (owner.contentDOM && owner.contentDOM.contains(el)) {
		if (el !== owner.contentDOM) return bias > 0 ? atEnd : atStart;
		const child = owner.contentDOM.childNodes[offset];
		if (!child) return atEnd;
		const at = child instanceof FaceElement ? positions.posOf(child) : null;
		return at === null ? atStart : entry.pos + at;
	}
	if (owner.contentDOM) return precedes(owner.dom, owner.contentDOM, el) ? atEnd : atStart;
	return offset === 0 && bias <= 0 ? atStart : bias > 0 ? atEnd : atStart;
}

function drawnTextOf(unit: NodeViewDesc): string {
	const units = unit.children.filter((child): child is NodeViewDesc => child instanceof NodeViewDesc);
	function contentText(): string {
		if (!unit.node.inlineContent) return units.map(drawnTextOf).join('');
		let next = 0;
		let text = '';
		unit.node.forEach((child) => {
			if (child.isText) text += child.text;
			else if (units[next]?.node === child) text += drawnTextOf(units[next++]);
		});
		return text;
	}
	function walk(at: FaceChild): string {
		if (at === unit.contentDOM) return contentText();
		return at instanceof FaceText ? at.data : at.childNodes.map(walk).join('');
	}
	return walk(unit.dom);
}

/** the text a node draws: its face's text with its content's in the hole (find's match text, TOC glide) */
export function nodeText(host: ViewQueryHost, pos: number): string {
	const unit = unitAtPos(host, pos);
	return unit ? drawnTextOf(unit) : (host.view.state.doc.nodeAt(pos)?.textContent ?? '');
}
