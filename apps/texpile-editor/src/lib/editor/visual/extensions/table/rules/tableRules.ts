// marks every cell of a table with the rules it prints and the side its text is set to, and the table the caret is in.
// What a table prints is the language's to say (`TableLook`)
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import { TableMap } from 'prosemirror-tables';
import { typedInParagraph } from '$lib/editor/visual/extensions/nodeNumbers';
import './tableRules.css';

export type RuleWeight = 'light' | 'heavy' | 'double';
export type CellAlign = 'left' | 'center' | 'right';
export type CellEdges = { top: RuleWeight | null; bottom: RuleWeight | null; left: boolean; right: boolean; align: CellAlign };

export type TableLook = {
	/** each cell's edges and alignment by the cell's offset inside the table; `inFloat`: the table stands in a table float or figure */
	edgesOf(table: Node, inFloat: boolean): Map<number, CellEdges>;
	/** the table states a width and fills it; any other is as wide as its cells */
	fillsWidth(table: Node): boolean;
	/** the choice the table's lines amount to, or null when they are a pattern of its own */
	linesOf(table: Node): TableLines | null;
	/** gives the table at `pos` every line, the three of a formal table, or none */
	setLines(view: EditorView, pos: number, lines: TableLines): void;
};

/** formal: a rule over the table, one under its first row and one under the table, as booktabs sets them */
export type TableLines = 'formal' | 'all' | 'none';

const tableRulesKey = new PluginKey<DecorationSet>('tableRules');

/** what the editor's language says its tables print, for the table settings */
export function tableLookOf(state: EditorState): TableLook | null {
	return (tableRulesKey.get(state)?.spec as { look?: TableLook } | undefined)?.look ?? null;
}

/** all: every row and column boundary is ruled. formal: no bars, the table closed above and below, and at most its other rows parted here and there */
export function linesOfEdges(table: Node, edges: ReadonlyMap<number, CellEdges>): TableLines | null {
	if (edges.size === 0) return null;
	const map = TableMap.get(table);
	const cells = [...edges].map(([at, e]) => ({ e, rect: map.findCell(at) }));
	const bars = cells.some(({ e }) => e.left || e.right);
	if (!bars && cells.every(({ e }) => !e.top && !e.bottom)) return 'none';
	const everyRow = cells.every(({ e }) => e.top && e.bottom);
	// border by border a cell shares its left edge with the cell before it, which a multicolumn leaves to that cell
	if (bars) return everyRow && cells.every(({ e, rect }) => e.right && (rect.left > 0 || e.left)) ? 'all' : null;
	const closed = cells.every(({ e, rect }) => (rect.top > 0 || e.top) && (rect.bottom < map.height || e.bottom));
	return closed && (!everyRow || map.height <= 2) ? 'formal' : null;
}

type Mark = { from: number; to: number; cls: string };

const WEIGHTS: RuleWeight[] = ['light', 'double', 'heavy'];

export function heavierRule(a: RuleWeight | null, b: RuleWeight | null): RuleWeight | null {
	if (!a || !b) return a ?? b;
	return WEIGHTS.indexOf(a) >= WEIGHTS.indexOf(b) ? a : b;
}

function tableMarks(look: TableLook, table: Node, at: number, inFloat: boolean, out: Mark[]): void {
	out.push({
		from: at,
		to: at + table.nodeSize,
		cls: look.fillsWidth(table) ? 'rules-as-printed' : 'rules-as-printed table-natural-width'
	});
	for (const [cell, edges] of look.edgesOf(table, inFloat)) {
		const names = [
			edges.top && `rule-top-${edges.top}`,
			edges.bottom && `rule-bottom-${edges.bottom}`,
			edges.left && 'rule-left',
			edges.right && 'rule-right',
			edges.align !== 'left' && `cell-${edges.align}`
		].filter(Boolean);
		const from = at + 1 + cell;
		if (names.length) out.push({ from, to: from + table.nodeAt(cell)!.nodeSize, cls: names.join(' ') });
	}
}

export function tableRulesPlugin(look: TableLook): Plugin<DecorationSet> {
	// what a top-level block holds, kept while it is the same node: an edit reads one block again
	const inBlock = new WeakMap<Node, Mark[]>();

	function marksIn(block: Node): Mark[] {
		let marks = inBlock.get(block);
		if (marks) return marks;
		marks = [];
		const found = marks;
		if (block.type.name === 'table') tableMarks(look, block, 0, false, found);
		else
			block.descendants((node, pos, parent) => {
				if (node.type.name !== 'table') return !node.isTextblock;
				tableMarks(look, node, pos + 1, (parent ?? block).type.name === 'table_wrapper', found);
				return false;
			});
		inBlock.set(block, marks);
		return marks;
	}

	function decorate(doc: Node): DecorationSet {
		const decorations: Decoration[] = [];
		doc.forEach((block, offset) => {
			for (const mark of marksIn(block)) decorations.push(Decoration.node(offset + mark.from, offset + mark.to, { class: mark.cls }));
		});
		return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
	}

	const plugin: Plugin<DecorationSet> = new Plugin<DecorationSet>({
		key: tableRulesKey,
		look,
		state: {
			init: (_config, state) => decorate(state.doc),
			apply(tr, old) {
				if (!tr.docChanged) return old;
				return typedInParagraph(tr) ? old.map(tr.mapping, tr.doc) : decorate(tr.doc);
			}
		},
		props: { decorations: (state) => plugin.getState(state) }
	});
	return plugin;
}

function tableAround(state: EditorState): { from: number; to: number } | null {
	const { $from } = state.selection;
	for (let depth = $from.depth; depth > 0; depth--) {
		const node = $from.node(depth);
		if (node.type.name === 'table') return { from: $from.before(depth), to: $from.after(depth) };
	}
	return null;
}

/** the table holding the caret shows the edges that print no rule, as it does under the pointer */
export function tableCaretPlugin(): Plugin {
	return new Plugin({
		props: {
			decorations(state) {
				const table = tableAround(state);
				return table ? DecorationSet.create(state.doc, [Decoration.node(table.from, table.to, { class: 'table-has-caret' })]) : null;
			}
		}
	});
}
