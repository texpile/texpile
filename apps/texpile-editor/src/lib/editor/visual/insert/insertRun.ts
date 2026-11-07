import type { Fragment, Node, Schema } from 'prosemirror-model';
import { NodeSelection, Selection, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import type { BlockInsertItem, InsertItem } from './insertItem';

type Placed = Pick<BlockInsertItem, 'make' | 'select' | 'neverIn'>;

function firstCellStart(tr: Transaction, at: number): number {
	let found = -1;
	tr.doc.nodeAt(at)?.descendants((child, pos) => {
		if (found >= 0) return false;
		const role = child.type.spec.tableRole;
		if (role === 'cell' || role === 'header_cell') found = at + 1 + pos + 1;
		return found < 0;
	});
	return found >= 0 ? found : at + 1;
}

function caretAfter(tr: Transaction, at: number): Selection {
	const end = at + tr.doc.nodeAt(at)!.nodeSize;
	if (!tr.doc.resolve(end).nodeAfter?.isTextblock) tr.insert(end, tr.doc.type.schema.nodes.paragraph.createAndFill()!);
	return TextSelection.near(tr.doc.resolve(end), 1);
}

function selectInserted(tr: Transaction, at: number, item: Placed): Transaction {
	const sel =
		item.select === 'after'
			? caretAfter(tr, at)
			: item.select === 'node'
				? NodeSelection.create(tr.doc, at)
				: TextSelection.near(tr.doc.resolve(item.select === 'cell' ? firstCellStart(tr, at) : at + 1));
	return tr.setSelection(sel).scrollIntoView();
}

/** a block put in over the selection splits the paragraph there: the half after it loses its leading space, which the saved file drops */
export function replaceSelectionWithBlock(tr: Transaction, node: Node): Transaction {
	const before = tr.steps.length;
	tr.replaceSelectionWith(node);
	let end = -1;
	for (let i = before; i < tr.steps.length; i++) {
		tr.steps[i].getMap().forEach((_a, _b, _c, newEnd) => {
			end = tr.mapping.slice(i + 1).map(newEnd);
		});
	}
	if (end < 0) return tr;
	const $end = tr.doc.resolve(end);
	if (!$end.parent.isTextblock || $end.parentOffset !== 0) return tr;
	const lead = /^\s*/.exec($end.parent.textContent)![0].length;
	return lead > 0 && $end.parent.firstChild?.isText ? tr.delete(end, end + lead) : tr;
}

export function insertHorizontalRule(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
	const tr = insertBlockAtCaret(state, { select: 'after', make: (schema) => schema.nodes.horizontal_rule.create() });
	if (tr && dispatch) dispatch(tr);
	return !!tr;
}

function placeFor(state: EditorState, at: number, node: Node, neverIn?: (parent: Node) => boolean): number {
	let $at = state.doc.resolve(at);
	while ($at.depth > 0 && (!$at.parent.canReplaceWith($at.index(), $at.index(), node.type) || neverIn?.($at.parent)))
		$at = state.doc.resolve($at.after());
	return $at.pos;
}

const ITEM_KEPT_ATTRS = ['kind', 'envName', 'envArgs', 'envKey'];

function nextListItem(item: Node): Node {
	const attrs: Record<string, unknown> = {};
	for (const key of ITEM_KEPT_ATTRS) attrs[key] = item.attrs[key];
	if (item.attrs.checked != null) attrs.checked = false;
	return item.type.create(attrs, item.type.schema.nodes.paragraph.create());
}

export function insertBlockAfter(state: EditorState, pos: number, item: BlockInsertItem): Transaction | null {
	const hovered = state.doc.nodeAt(pos);
	const node = item.make(state.schema);
	if (!hovered || !node) return null;
	if (hovered.type.name === 'list') {
		const isParagraph = item.id === 'standard';
		const placed = isParagraph ? nextListItem(hovered) : node;
		const at = isParagraph ? pos + hovered.nodeSize : placeFor(state, pos + hovered.nodeSize - 1, node, item.neverIn);
		return selectInserted(state.tr.insert(at, placed), at, isParagraph ? { select: 'in', make: () => placed } : item);
	}
	const at = placeFor(state, pos + hovered.nodeSize, node, item.neverIn);
	return selectInserted(state.tr.insert(at, node), at, item);
}

export function insertBlockAtCaret(state: EditorState, item: Placed): Transaction | null {
	const node = item.make(state.schema);
	if (!node) return null;
	const { $to } = state.selection;
	if ($to.parent.isTextblock && $to.depth > 0) {
		const empty =
			$to.parent.content.size === 0 &&
			!item.neverIn?.($to.node(-1)) &&
			$to.node(-1).canReplaceWith($to.index(-1), $to.index(-1) + 1, node.type);
		if (empty) return selectInserted(state.tr.replaceWith($to.before(), $to.after(), node), $to.before(), item);
		const at = placeFor(state, $to.after(), node, item.neverIn);
		return selectInserted(state.tr.insert(at, node), at, item);
	}
	const at = placeFor(state, $to.pos, node, item.neverIn);
	return selectInserted(state.tr.insert(at, node), at, item);
}

type Filled = { node: Node; offset: number };

function withFirstParagraph(node: Node, content: Fragment, schema: Schema): Filled | null {
	if (node.type === schema.nodes.paragraph) return { node: node.type.create(node.attrs, content), offset: 0 };
	let found: Filled | null = null;
	const children: Node[] = [];
	let offset = 0;
	node.forEach((child) => {
		if (!found) {
			const inner = withFirstParagraph(child, content, schema);
			if (inner) {
				found = { node: inner.node, offset: offset + 1 + inner.offset };
				children.push(inner.node);
				offset += inner.node.nodeSize;
				return;
			}
		}
		children.push(child);
		offset += child.nodeSize;
	});
	const filled = found as Filled | null;
	return filled && { node: node.type.create(node.attrs, children, node.marks), offset: filled.offset };
}

export function allowedAtCaret(state: EditorState, item: BlockInsertItem): boolean {
	const { $from } = state.selection;
	for (let depth = $from.depth; depth > 0; depth--) if (item.neverIn?.($from.node(depth))) return false;
	return true;
}

export function turnIntoStyle(state: EditorState, item: BlockInsertItem, dispatch?: (tr: Transaction) => void): boolean {
	if (!item.style || !allowedAtCaret(state, item)) return false;
	if (item.turnIn?.(state, dispatch)) return true;
	if (item.turn) return item.turn(state, dispatch);
	const { $from } = state.selection;
	const block = $from.parent;
	if (!block.isTextblock || $from.depth === 0) return false;
	const made = item.make(state.schema);
	const filled = made && withFirstParagraph(made, block.content, state.schema);
	if (!filled) return false;
	const parent = $from.node(-1);
	if (!parent.canReplaceWith($from.index(-1), $from.index(-1) + 1, filled.node.type)) return false;
	if (dispatch) {
		const start = $from.before();
		const tr = state.tr.replaceWith(start, $from.after(), filled.node);
		const caret = start + filled.offset + 1 + $from.parentOffset;
		dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(caret, tr.doc.content.size)))).scrollIntoView());
	}
	return true;
}

export function styleAt(state: EditorState, items: readonly InsertItem[]): BlockInsertItem | null {
	const styles = items.filter((item): item is BlockInsertItem => item.shape === 'block' && item.style && !!item.is);
	function styleOf(node: Node): BlockInsertItem | null {
		return styles.find((item) => item.is!(node)) ?? null;
	}
	const { $from } = state.selection;
	const own = styleOf($from.parent);
	if (own && $from.parent.type !== state.schema.nodes.paragraph) return own;
	for (let depth = $from.depth - 1; depth > 0; depth--) {
		const found = styleOf($from.node(depth));
		if (found) return found;
	}
	return own;
}
