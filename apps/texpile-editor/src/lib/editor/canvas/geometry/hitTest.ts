// prosemirror-view's posAtCoords and Chromium's caretPositionFromPoint over the placed layout (7.4)
import type { Mark, Node as PMNode } from 'prosemirror-model';
import { Selection } from 'prosemirror-state';
import type { DecorationAttrs } from 'prosemirror-view';
import type { InlineDecorationView } from '../contracts/decorationTypes';
import type { CanvasHit, CaretPlace, CaretPolicy, CursorKind, DecorationHit, HitTarget, ResizeHandle } from '../contracts/geometryTypes';
import type { DocPoint, LineBox, LineFragment } from '../contracts/layoutTypes';
import type { VisualView } from '../contracts/viewTypes';
import type { DocumentModel } from '../contracts/engineTypes';
import { FaceElement } from '../tree/faceElement';
import type { GeometryTools } from './caretRects';
import { caretPolicyOf } from './caretPolicy';
import { stopOffsets } from './caretStops';
import { blockOnModel, lineEnd, type BlockOnModel, type PlacedBox, type PlacedTextblock } from './lineIndex';
import { offsetNearX, textX, type TextFragment } from './positionMap';
import { caretPath, pmPos } from './posFromCaret';

/** the run a text hit stands in, for the elements text would have had in the DOM (C1's inlineHitChain) */
export type InlineChainRun = {
	readonly textblock: FaceElement;
	readonly marks: readonly Mark[];
	readonly decorations: readonly InlineDecorationView[];
	readonly content: PMNode;
	readonly contentStart: number;
	/** the character under the point */
	readonly at: number;
};

export type HitTools = GeometryTools & {
	readonly view: VisualView;
	readonly inlineChain?: (run: InlineChainRun) => FaceElement[];
};

type Point = { readonly x: number; readonly y: number };
type Terminal =
	| { kind: 'text'; textblock: PlacedTextblock; index: number; fragment: LineFragment | null }
	| { kind: 'leaf'; placed: PlacedBox }
	| { kind: 'box'; placed: PlacedBox };
type Descent = { path: PlacedBox[]; deepest: PlacedBox | null; terminal: Terminal };

/** a line box's leading splits unevenly by a pixel: a click there goes to the nearer caret, not the nearer box edge */
const SAME_LINE_PX = 1;
const HANDLE = /^handle-(n|ne|e|se|s|sw|w|nw)$/;

function inRect(q: Point, x: number, y: number, width: number, height: number): boolean {
	return q.x >= x && q.x < x + width && q.y >= y && q.y < y + height;
}

function contains(placed: PlacedBox, q: Point): boolean {
	const { box } = placed;
	if (box.style.paint.pointerEvents === 'none') return false;
	return (
		inRect(q, placed.x, placed.y, box.width, box.height) ||
		!!box.continuations?.some((piece) => inRect(q, placed.x + piece.x, placed.y + piece.y, piece.width, piece.height))
	);
}

/** Chromium's PositionForPoint in a block container: the child holding the point, else the first whose bottom is below it */
function childAt(children: readonly PlacedBox[], q: Point): PlacedBox {
	const holding = children.findLast((child) => contains(child, q));
	if (holding) return holding;
	const below = children.find((child) => child.y + child.box.height > q.y) ?? children[children.length - 1];
	const row = children.filter((child) => child.y < below.y + below.box.height && below.y < child.y + child.box.height);
	function gap(child: PlacedBox): number {
		return Math.max(0, child.x - q.x, q.x - (child.x + child.box.width));
	}
	return row.reduce((best, child) => (gap(child) < gap(best) ? child : best), below);
}

/** where the next line takes over: the edge of the line box, or the middle between the two carets when that is within a pixel of it */
function lineBoundary(line: LineBox, next: LineBox): number {
	const edge = line.y + line.height;
	if (next.y > edge) return (edge + next.y) / 2;
	const between = (line.textBottom + next.textTop) / 2;
	return Math.abs(between - edge) <= SAME_LINE_PX ? between : edge;
}

function distanceToLine(line: LineBox, x: number): number {
	const xs = line.fragments.map((fragment) => fragment.x);
	const ends = line.fragments.map((fragment) => fragment.x + fragment.width);
	return Math.max(0, Math.min(...xs) - x, x - Math.max(...ends));
}

/** the line at a point: by y, and in a paragraph split across columns by the column too */
function lineAtY(textblock: PlacedTextblock, y: number, x = 0): number {
	const { lines } = textblock;
	if (textblock.box.continuations) {
		const here = lines.flatMap((line, i) => (y >= line.y && y < line.y + line.height ? [i] : []));
		if (here.length) return here.reduce((best, i) => (distanceToLine(lines[i], x) < distanceToLine(lines[best], x) ? i : best));
	}
	let index = 0;
	while (index < lines.length - 1 && y >= lineBoundary(lines[index], lines[index + 1])) index++;
	return index;
}

function fragmentUnder(fragments: readonly LineFragment[], x: number): LineFragment | null {
	return fragments.find((fragment) => x >= fragment.x && x < fragment.x + fragment.width) ?? null;
}

const DRAWN_WHOLE: ReadonlySet<CaretPolicy> = new Set(['formula', 'atom', 'character', 'ownLine', 'drawnBlock']);

function clipsOverflow(placed: PlacedBox): boolean {
	const { overflowX, overflowY } = placed.box.style.layout;
	return overflowX !== 'visible' || overflowY !== 'visible';
}

/** an inline-block inside an inline element of a face sits on its lines, not among its children */
function inlineBoxesIn(placement: BlockOnModel['placement'], at: PlacedBox): PlacedBox[] {
	const found: PlacedBox[] = [];
	for (const line of at.box.lines ?? [])
		for (const fragment of line.fragments) {
			const placed = fragment.kind === 'atomic' ? placement.placed.get(fragment.box) : undefined;
			if (placed) found.push(placed);
		}
	return found;
}

/** the element under the point inside a face drawn whole: its handlers, hint and cursor answer, though the caret stops at the
 *  face; as in Chromium, an element placed past its parent's box answers there unless the parent clips */
function deepestInFace(placement: BlockOnModel['placement'], face: PlacedBox, q: Point): PlacedBox | null {
	function under(at: PlacedBox): PlacedBox | null {
		if (clipsOverflow(at) && !contains(at, q)) return null;
		const children = [...(placement.children.get(at) ?? []), ...inlineBoxesIn(placement, at)];
		for (let i = children.length - 1; i >= 0; i--) {
			const found = under(children[i]);
			if (found) return found;
		}
		return contains(at, q) ? at : null;
	}
	return under(face);
}

function descend(block: BlockOnModel, q: Point, view: VisualView): Descent {
	const { placement } = block;
	const path: PlacedBox[] = [];
	let deepest: PlacedBox | null = null;
	let current = placement.boxes[0];
	for (;;) {
		if (current.box.node) path.push(current);
		if (contains(current, q)) deepest = current;
		const node = current.box.node?.node;
		// a node drawn whole (a display formula, a drawn chip): the hit stops at it, not at the elements inside its face
		if (
			current.box.kind === 'replaced' ||
			node?.isLeaf ||
			(node?.isAtom && node.isInline) ||
			(node && DRAWN_WHOLE.has(caretPolicyOf(view, node)))
		)
			return { path, deepest: deepestInFace(placement, current, q) ?? deepest, terminal: { kind: 'leaf', placed: current } };
		const lines = current.box.lines;
		if (lines?.length) {
			const textblock = 'lines' in current ? (current as PlacedTextblock) : null;
			const index = textblock ? lineAtY(textblock, q.y - current.y, q.x - current.x) : 0;
			const fragment = fragmentUnder(lines[index].fragments, q.x - current.x);
			const inner = fragment?.kind === 'atomic' ? fragment.box : fragment?.kind === 'widget' ? fragment.box : null;
			const innerPlaced = inner && placement.placed.get(inner);
			if (innerPlaced && contains(innerPlaced, q)) {
				current = innerPlaced;
				continue;
			}
			if (textblock) return { path, deepest, terminal: { kind: 'text', textblock, index, fragment } };
		}
		const children = placement.children.get(current);
		if (!children?.length) return { path, deepest, terminal: { kind: 'box', placed: current } };
		current = childAt(children, q);
	}
}

function textCaret(textblock: PlacedTextblock, index: number, x: number, block: BlockOnModel, tools: GeometryTools): CaretPlace {
	const line = textblock.lines[index];
	const end = lineEnd(line);
	const last = index === textblock.lines.length - 1;
	if (line.hyphen && x >= line.hyphen.x) return { pos: block.frame.pos + end, affinity: last ? 1 : -1 };
	const stops = stopOffsets(textblock.node).map((offset) => textblock.offset + 1 + offset);
	const stop = offsetNearX(textblock, index, x, stops, { top: block.node, measure: tools.measure });
	return { pos: block.frame.pos + stop, affinity: stop === end && !last ? -1 : 1 };
}

function isInside(placed: PlacedBox, owner: PlacedBox): boolean {
	for (let at: PlacedBox | null = placed; at; at = at.parent) if (at === owner) return true;
	return false;
}

/** rule 5: over a drawn block, the nearest stop in the nearest textblock by vertical distance (this block first). In a cell's
 *  padding that is the cell's own text: the cells of a row tie, and a cell drag's head jumped to the first of them */
function nearestTextCaret(model: DocumentModel, block: BlockOnModel, q: Point, tools: GeometryTools, cell: PlacedBox | null): CaretPlace {
	const docY = block.frame.top + q.y;
	let best: { block: BlockOnModel; textblock: PlacedTextblock; index: number; distance: number } | null = null;
	function consider(candidate: BlockOnModel | null, within: PlacedBox | null = null): void {
		for (const textblock of candidate?.placement.textblocks ?? [])
			if (!within || isInside(textblock, within))
				textblock.lines.forEach((line, index) => {
					const top = candidate!.frame.top + textblock.y + line.y;
					const distance = Math.max(0, top - docY, docY - (top + line.height));
					if (!best || distance < best.distance) best = { block: candidate!, textblock, index, distance };
				});
	}
	if (cell) consider(block, cell);
	if (!best) consider(block);
	for (let step = 1; !best && step <= 3; step++) {
		consider(blockOnModel(model, block.index - step));
		consider(blockOnModel(model, block.index + step));
	}
	if (!best) return { pos: block.frame.pos, affinity: 1 };
	const found: { block: BlockOnModel; textblock: PlacedTextblock; index: number } = best;
	return textCaret(found.textblock, found.index, q.x - found.textblock.x, found.block, tools);
}

/** beside or over a display formula the DOM editor's caret went to the text after it, the way PM maps a caret inside an atom */
function formulaBlockCaret(placed: PlacedBox, block: BlockOnModel, view: VisualView): CaretPlace | null {
	const leaf = placed.box.node;
	if (!leaf?.node.isBlock || caretPolicyOf(view, leaf.node) !== 'formula') return null;
	const { doc } = view.state;
	const $after = doc.resolve(block.frame.pos + leaf.offset + leaf.node.nodeSize);
	const found = Selection.findFrom($after, 1, true) ?? Selection.findFrom($after, -1, true);
	return found && { pos: found.head, affinity: 1 };
}

function leafCaret(placed: PlacedBox, q: Point, block: BlockOnModel): CaretPlace | null {
	const textblock = placed.inLine;
	const node = placed.box.node;
	if (!textblock || !node) return null;
	const before = q.x < placed.x + placed.box.width / 2;
	const offset = before ? node.offset : node.offset + node.node.nodeSize;
	const index = textblock.lines.findIndex((line) => line.fragments.some((f) => f.kind === 'atomic' && f.box === placed.box));
	const ends = index >= 0 && index < textblock.lines.length - 1 && offset === lineEnd(textblock.lines[index]);
	return { pos: block.frame.pos + offset, affinity: ends && !before ? -1 : 1 };
}

/** an element's node view has a contentDOM: an element under its root holds the node's content */
function nodeBoxAbove(placed: PlacedBox | null): PlacedBox | null {
	let at = placed;
	while (at && !at.box.node) at = at.parent;
	return at;
}

function elementChain(el: FaceElement | null): FaceElement[] {
	const chain: FaceElement[] = [];
	for (let at: FaceElement | null = el; at; at = at.parentNode instanceof FaceElement ? at.parentNode : null) chain.push(at);
	return chain;
}

function decorationsAt(view: VisualView, pos: number): InlineDecorationView[] {
	const found: InlineDecorationView[] = [];
	view.someProp('decorations', (f) => {
		f(view.state)?.forEachSet((set) => {
			for (const decoration of set.find(pos, pos)) {
				const internals = decoration as unknown as { inline: boolean; type: { attrs?: DecorationAttrs } };
				if (!internals.inline || decoration.from > pos || decoration.to <= pos) continue;
				const { class: classes, style, ...attrs } = internals.type.attrs ?? {};
				const plain = Object.fromEntries(Object.entries(attrs).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
				found.push({
					from: decoration.from,
					to: decoration.to,
					classes: (classes ?? '').split(/\s+/).filter(Boolean),
					style: style ?? '',
					attrs: plain,
					spec: decoration.spec
				});
			}
		});
	});
	return found;
}

function cursorOf(kind: CursorKind | 'auto', editableText: boolean): CursorKind {
	return kind === 'auto' ? (editableText ? 'text' : 'default') : kind;
}

function roleOf(placed: PlacedBox): unknown {
	return placed.box.node!.node.type.spec.tableRole;
}

function cellBoxOf(path: readonly PlacedBox[]): PlacedBox | null {
	return path.findLast((placed) => roleOf(placed) === 'cell' || roleOf(placed) === 'header_cell') ?? null;
}

function cellOf(path: readonly PlacedBox[], block: BlockOnModel): { cellPos: number; tablePos: number } | null {
	const cell = cellBoxOf(path);
	const table = path.findLast((placed) => roleOf(placed) === 'table');
	if (!cell || !table) return null;
	return { cellPos: block.frame.pos + cell.box.node!.offset, tablePos: block.frame.pos + table.box.node!.offset };
}

function partTarget(deepest: PlacedBox | null, block: BlockOnModel): HitTarget | null {
	for (let at = deepest; at; at = at.parent) {
		const part = at.box.element?.anchor;
		if (!part) continue;
		const owner = nodeBoxAbove(at);
		const pos = block.frame.pos + (owner?.box.node?.offset ?? 0);
		const handle = HANDLE.exec(part);
		return handle ? { kind: 'handle', pos, handle: handle[1] as ResizeHandle } : { kind: 'facePart', pos, part };
	}
	return null;
}

function boundaryTarget(view: VisualView, pos: number): HitTarget {
	const $pos = view.state.doc.resolve(Math.min(pos, view.state.doc.content.size));
	const before = $pos.nodeBefore ? pos - $pos.nodeBefore.nodeSize : null;
	return { kind: 'between', before, after: $pos.nodeAfter ? pos : null };
}

/** rule 1: the first stop of the document above it, the last below it */
function edgeCaret(model: DocumentModel, end: boolean): CaretPlace {
	for (let step = 0; step < Math.min(model.count, 8); step++) {
		const block = blockOnModel(model, end ? model.count - 1 - step : step);
		const textblocks = block?.placement.textblocks ?? [];
		const textblock = end ? textblocks[textblocks.length - 1] : textblocks[0];
		if (block && textblock) return { pos: block.frame.pos + textblock.offset + (end ? textblock.node.nodeSize - 1 : 1), affinity: 1 };
	}
	return { pos: end ? model.view.state.doc.content.size : 0, affinity: 1 };
}

function targetOf(descent: Descent, q: Point, caret: CaretPlace, pos: number, block: BlockOnModel, view: VisualView): HitTarget {
	const { terminal, deepest } = descent;
	const part = partTarget(deepest, block);
	if (part) return part;
	if (terminal.kind === 'text') {
		const { textblock, fragment } = terminal;
		if (fragment?.kind === 'struck')
			return {
				kind: 'widget',
				key: fragment.widget,
				pos: block.frame.pos + fragment.at,
				side: q.x - textblock.x < fragment.x + fragment.width / 2 ? -1 : 1
			};
		if (!contains(textblock, q)) return boundaryTarget(view, pos);
		const textblockPos = block.frame.pos + textblock.offset;
		return caretPolicyOf(view, textblock.node) === 'island'
			? { kind: 'island', pos: textblockPos, offset: caret.pos - textblockPos - 1 }
			: { kind: 'text', textblock: textblockPos };
	}
	const leaf = terminal.kind === 'leaf' ? terminal.placed.box.node : null;
	if (!leaf) return boundaryTarget(view, pos);
	const leafPos = block.frame.pos + leaf.offset;
	const policy = caretPolicyOf(view, leaf.node);
	if (policy === 'formula')
		return { kind: 'formula', pos: leafPos, local: { x: q.x - terminal.placed.x, y: q.y - terminal.placed.y }, display: leaf.node.isBlock };
	if (policy === 'island') return { kind: 'island', pos: leafPos, offset: 0 };
	return { kind: 'leaf', pos: leafPos, policy };
}

type HitDetails = Pick<CanvasHit, 'chain' | 'cursor' | 'marks' | 'decorations' | 'hint'>;

/** block offset of the character x is over: the caret stops on its nearer edge, so one past it in the far half */
function characterUnder(fragment: TextFragment, caret: number, x: number, top: PMNode, tools: GeometryTools): number {
	const last = Math.max(fragment.from, fragment.to - 1);
	const at = Math.min(Math.max(caret, fragment.from), last);
	if (at === fragment.from) return at;
	const [a, b] = [textX(fragment, at - 1, top, tools.measure), textX(fragment, at, top, tools.measure)];
	return x >= Math.min(a, b) && x <= Math.max(a, b) ? at - 1 : at;
}

function detailsOf(descent: Descent, caret: CaretPlace, q: Point, block: BlockOnModel, tools: HitTools): HitDetails {
	const { terminal, deepest } = descent;
	const { view } = tools;
	const text = terminal.kind === 'text' && terminal.fragment?.kind === 'text' && deepest === terminal.textblock ? terminal : null;
	const fragment = text?.fragment?.kind === 'text' ? text.fragment : null;
	const under = fragment && text ? characterUnder(fragment, caret.pos - block.frame.pos, q.x - text.textblock.x, block.node, tools) : 0;
	const marks = fragment ? (block.node.nodeAt(under - 1)?.marks ?? []) : [];
	const views = fragment ? decorationsAt(view, block.frame.pos + under) : [];
	const hole = text?.textblock.box.element;
	const chain =
		hole && text && fragment && tools.inlineChain
			? tools.inlineChain({
					textblock: hole,
					marks,
					decorations: views,
					content: text.textblock.node,
					contentStart: block.frame.pos + text.textblock.offset + 1,
					at: block.frame.pos + under
				})
			: elementChain(nodeElementOf(deepest));
	const kind = fragment ? fragment.run.paint.cursor : (deepest?.box.style.paint.cursor ?? 'auto');
	// Chromium shows the text cursor over all of an editable host: past a line's end and between blocks too
	const editableText =
		view.editable &&
		(terminal.kind === 'box' ||
			(terminal.kind === 'text' && ['text', 'island', 'caption'].includes(caretPolicyOf(view, terminal.textblock.node))) ||
			(terminal.kind === 'leaf' &&
				!!terminal.placed.box.node &&
				['formula', 'island'].includes(caretPolicyOf(view, terminal.placed.box.node.node))));
	const decorations: DecorationHit[] = views.map((d) => ({
		from: d.from,
		to: d.to,
		attrs: { ...d.attrs, ...(d.classes.length ? { class: d.classes.join(' ') } : {}), ...(d.style ? { style: d.style } : {}) },
		spec: d.spec
	}));
	return { chain, cursor: cursorOf(kind, editableText), marks, decorations, hint: chain.find((el) => el.hint)?.hint ?? null };
}

/** any doc point (7.4); null only for an empty model */
export function hitAt(model: DocumentModel, tools: HitTools, p: DocPoint): CanvasHit | null {
	if (!model.count) return null;
	const { view } = tools;
	const last = model.count - 1;
	const above = p.y < model.top(0).y;
	// the last block is laid out only for a point in its pitch: a hit is asked on every key and pointer move
	const lastBlock = !above && model.indexAtY(p.y) === last ? blockOnModel(model, last)! : null;
	const below = !!lastBlock && p.y >= lastBlock.frame.top + lastBlock.layout.height;
	const side = p.x < 0 ? 'left' : p.x > model.width ? 'right' : null;
	const x = Math.min(Math.max(p.x, 0), Math.max(0, model.width - 0.01));
	const index = above ? 0 : below ? last : model.indexAtY(p.y);
	let block = blockOnModel(model, index)!;
	if (!above && !below && p.y >= block.frame.top + block.layout.height && index < last) block = blockOnModel(model, index + 1)!;
	const q = { x: p.x, y: p.y - block.frame.top };
	const clamped = { x, y: q.y };
	const descent = descend(block, clamped, view);
	const { terminal, path } = descent;
	let caret: CaretPlace;
	if (above || below) caret = edgeCaret(model, below);
	else if (terminal.kind === 'text') caret = textCaret(terminal.textblock, terminal.index, x - terminal.textblock.x, block, tools);
	else
		caret =
			(terminal.kind === 'leaf' && (leafCaret(terminal.placed, clamped, block) || formulaBlockCaret(terminal.placed, block, view))) ||
			nearestTextCaret(model, block, clamped, tools, cellBoxOf(path));
	const caretWalk = terminal.kind === 'box' ? (caretPath(block, caret.pos) ?? path) : path;
	const pos = above ? 0 : below ? view.state.doc.content.size : pmPos(caretWalk, q, caret.pos, block);
	const atPoint = x === p.x ? descent : descend(block, q, view);
	const insideBox = above || below ? null : nodeBoxAbove(atPoint.deepest);
	let target = targetOf(descent, clamped, caret, pos, block, view);
	const cell = cellOf(path, block);
	if (cell) target = { kind: 'cell', ...cell, inner: target };
	if (above || below) target = { kind: 'margin', side: above ? 'above' : 'below' };
	else if (side) target = { kind: 'margin', side };
	return {
		pos,
		inside: insideBox ? block.frame.pos + insideBox.box.node!.offset : -1,
		caret,
		target,
		...detailsOf(descent, caret, clamped, block, tools)
	};
}

function nodeElementOf(placed: PlacedBox | null): FaceElement | null {
	for (let at = placed; at; at = at.parent) if (at.box.element) return at.box.element;
	return null;
}
