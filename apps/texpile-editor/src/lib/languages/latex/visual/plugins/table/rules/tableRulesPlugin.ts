// marks every cell of a LaTeX table with the rules it prints, and the table the caret is in
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import { typedInParagraph } from '$lib/languages/latex/visual/core';
import { cellEdgesOf, fillsWidth } from './tableRuleEdges';
import './tableRules.css';

type Mark = { from: number; to: number; cls: string };

// what a top-level block holds, kept while it is the same node: an edit reads one block again
const inBlock = new WeakMap<Node, Mark[]>();

function tableMarks(table: Node, at: number, out: Mark[]): void {
	out.push({ from: at, to: at + table.nodeSize, cls: fillsWidth(table) ? 'rules-as-printed' : 'rules-as-printed table-natural-width' });
	for (const [cell, edges] of cellEdgesOf(table)) {
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

function marksIn(block: Node): Mark[] {
	let marks = inBlock.get(block);
	if (marks) return marks;
	marks = [];
	const found = marks;
	if (block.type.name === 'table') tableMarks(block, 0, found);
	else
		block.descendants((node, pos) => {
			if (node.type.name !== 'table') return !node.isTextblock;
			tableMarks(node, pos + 1, found);
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

const rulesKey = new PluginKey<DecorationSet>('table-rules');

export function tableRulesPlugin(): Plugin {
	return new Plugin({
		key: rulesKey,
		state: {
			init: (_config, state) => decorate(state.doc),
			apply(tr, old) {
				if (!tr.docChanged) return old;
				return typedInParagraph(tr) ? old.map(tr.mapping, tr.doc) : decorate(tr.doc);
			}
		},
		props: { decorations: (state) => rulesKey.getState(state) }
	});
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
