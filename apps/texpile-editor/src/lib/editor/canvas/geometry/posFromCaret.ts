// prosemirror-view's posFromCaret over the placed layout: the place a hit stands for, from the caret's node up (7.4)
import type { FaceElement } from '../tree/faceElement';
import type { BlockOnModel, PlacedBox } from './lineIndex';

type Point = { readonly x: number; readonly y: number };

const TABLE_PARTS = /^T(R|BODY|HEAD|FOOT)$/;
const holes = new WeakMap<FaceElement, boolean>();

function holdsContent(placed: PlacedBox, block: BlockOnModel): boolean {
	const root = placed.box.element;
	const node = placed.box.node;
	if (!root || !node || node.node.isLeaf) return false;
	const known = holes.get(root);
	if (known !== undefined) return known;
	const start = node.offset + 1;
	function walk(el: FaceElement): boolean {
		return (el.hole && block.layout.positions.contentStart(el) === start) || el.children.some((child) => walk(child));
	}
	const found = walk(root);
	holes.set(root, found);
	return found;
}

/** posFromCaret: walking up from the caret, a block the point is outside of gives its boundary, a leaf the nearer side */
export function pmPos(path: readonly PlacedBox[], q: Point, caret: number, block: BlockOnModel): number {
	let outside = -1;
	let sawBlock = false;
	for (let i = path.length - 1; i >= 0; i--) {
		const placed = path[i];
		const { node, offset } = placed.box.node!;
		const before = block.frame.pos + offset;
		const after = before + node.nodeSize;
		const withoutContent = !holdsContent(placed, block);
		const { width, height } = placed.box;
		if (!((node.isBlock || withoutContent) && (width || height))) continue;
		const left = placed.x;
		const top = placed.y;
		if (node.isBlock && !TABLE_PARTS.test(placed.box.element?.tagName ?? '')) {
			if ((!sawBlock && left > q.x) || top > q.y) outside = before;
			else if ((!sawBlock && left + width < q.x) || top + height < q.y) outside = after;
			sawBlock = true;
		}
		if (withoutContent && outside < 0 && !node.isText) {
			const near = node.isBlock ? q.y < top + height / 2 : q.x < left + width / 2;
			return near ? before : after;
		}
	}
	return outside > -1 ? outside : caret;
}

/** the boxes down to the textblock holding the caret: posFromCaret walks up from the caret's node, not the point's */
export function caretPath(block: BlockOnModel, caret: number): PlacedBox[] | null {
	const offset = caret - block.frame.pos;
	const textblock = block.placement.textblocks.find((t) => t.offset < offset && offset < t.offset + t.node.nodeSize);
	if (!textblock) return null;
	const path: PlacedBox[] = [];
	for (let at: PlacedBox | null = textblock; at; at = at.parent) if (at.box.node) path.unshift(at);
	return path;
}
