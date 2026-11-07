// an ordered item's number, counted from the document: the stylesheet's counter ran on from other lists (1., 4.)
import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export type OrderedItem = { node: PMNode; pos: number };
export type OrderedRun = { items: OrderedItem[]; depth: number };
export type ItemLabels = Map<number, string>;

function isOrdered(node: PMNode): boolean {
	return node.type.name === 'list' && node.attrs.kind === 'ordered';
}

export function orderedRuns(doc: PMNode, together: (a: PMNode, b: PMNode) => boolean = () => true): OrderedRun[] {
	const runs: OrderedRun[] = [];
	function walk(parent: PMNode, start: number, depth: number): void {
		let run: OrderedRun | null = null;
		parent.forEach((node, offset) => {
			const pos = start + offset;
			const last = run?.items.at(-1);
			if (!isOrdered(node)) run = null;
			else if (run && last && together(last.node, node)) run.items.push({ node, pos });
			else runs.push((run = { items: [{ node, pos }], depth }));
			if (!node.isLeaf && !node.isTextblock) walk(node, pos + 1, depth + (isOrdered(node) ? 1 : 0));
		});
	}
	walk(doc, 0, 0);
	return runs.sort((a, b) => a.items[0].pos - b.items[0].pos);
}

export function plainItemLabels(doc: PMNode): ItemLabels {
	const out: ItemLabels = new Map();
	for (const run of orderedRuns(doc)) {
		const start = Number(run.items[0].node.attrs.order ?? 1);
		run.items.forEach((item, i) => out.set(item.pos, `${start + i}.`));
	}
	return out;
}

const key = new PluginKey<DecorationSet>('list-numbers');

function decorate(doc: PMNode, labelsOf: (doc: PMNode) => ItemLabels): DecorationSet {
	const decorations: Decoration[] = [];
	for (const [pos, label] of labelsOf(doc)) {
		const node = doc.nodeAt(pos);
		if (node) decorations.push(Decoration.node(pos, pos + node.nodeSize, { 'data-item-label': label }));
	}
	return DecorationSet.create(doc, decorations);
}

export function listNumbersPlugin(labelsOf: (doc: PMNode) => ItemLabels = plainItemLabels): Plugin<DecorationSet> {
	return new Plugin<DecorationSet>({
		key,
		state: {
			init: (_, state) => decorate(state.doc, labelsOf),
			apply: (tr, set) => (tr.docChanged ? decorate(tr.doc, labelsOf) : set)
		},
		props: { decorations: (state) => key.getState(state) }
	});
}
