// an ordered item's number, counted from the document: the stylesheet's counter ran on from other lists (1., 4.)
import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import { Decoration, DecorationSet } from 'prosemirror-view';

export type OrderedItem = { node: PMNode; pos: number };
export type OrderedRun = { items: OrderedItem[]; depth: number };
export type ItemLabels = Map<number, string>;
export type BulletItem = { node: PMNode; pos: number; depth: number };

export const MARKDOWN_BULLETS = ['\u2022', '\u25E6', '\u25AA'] as const;
export const TYPST_BULLETS = ['\u2022', '\u2023', '\u2013'] as const;

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

function isBullet(node: PMNode): boolean {
	return node.type.name === 'list' && node.attrs.kind === 'bullet' && node.attrs.envName !== 'description';
}

/** every bullet item with the number of bullet lists around it */
export function bulletItems(doc: PMNode): BulletItem[] {
	const items: BulletItem[] = [];
	function walk(parent: PMNode, start: number, depth: number): void {
		parent.forEach((node, offset) => {
			const pos = start + offset;
			const bullet = isBullet(node);
			if (bullet) items.push({ node, pos, depth });
			if (!node.isLeaf && !node.isTextblock) walk(node, pos + 1, depth + (bullet ? 1 : 0));
		});
	}
	walk(doc, 0, 0);
	return items;
}

export function bulletLabels(doc: PMNode, markOf: (item: BulletItem) => string): ItemLabels {
	return new Map(bulletItems(doc).map((item) => [item.pos, markOf(item)]));
}

export function plainItemLabels(doc: PMNode): ItemLabels {
	const out: ItemLabels = new Map();
	for (const run of orderedRuns(doc)) {
		const start = Number(run.items[0].node.attrs.order ?? 1);
		run.items.forEach((item, i) => out.set(item.pos, `${start + i}.`));
	}
	return out;
}

/** numbers by the plain rule and bullets by the cycle of marks the language prints */
export function itemLabelsWithBullets(marks: readonly string[]): (doc: PMNode) => ItemLabels {
	return (doc) => new Map([...plainItemLabels(doc), ...bulletLabels(doc, (item) => marks[item.depth % marks.length])]);
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

/** typing and deleting inside one textblock: no block node or attribute changes, so block decorations only move */
export function editsInsideTextblocks(tr: Transaction): boolean {
	return tr.steps.every((step, i) => {
		if (!(step instanceof ReplaceStep) || step.slice.openStart || step.slice.openEnd) return false;
		let inline = true;
		step.slice.content.forEach((node) => (inline &&= node.isInline));
		const $from = tr.docs[i].resolve(step.from);
		return inline && $from.parent.isTextblock && step.to <= $from.end();
	});
}

export function listNumbersPlugin(labelsOf: (doc: PMNode) => ItemLabels = plainItemLabels): Plugin<DecorationSet> {
	return new Plugin<DecorationSet>({
		key,
		state: {
			init: (_, state) => decorate(state.doc, labelsOf),
			apply: (tr, set) => {
				if (!tr.docChanged) return set;
				return editsInsideTextblocks(tr) ? set.map(tr.mapping, tr.doc) : decorate(tr.doc, labelsOf);
			}
		},
		props: { decorations: (state) => key.getState(state) }
	});
}
