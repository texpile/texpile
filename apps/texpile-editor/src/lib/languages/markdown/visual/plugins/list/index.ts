import type { Node } from 'prosemirror-model';
import {
	listFamily,
	listMarker,
	sameList,
	type Ctx,
	type MarkdownPlugin,
	type MarkdownSaveCore
} from '$lib/languages/markdown/visual/core';
import { readList } from './listImport';

function indentAfterFirstLine(text: string, indent: string): string {
	return text
		.split('\n')
		.map((l, i) => (i === 0 || l === '' ? l : indent + l))
		.join('\n');
}

function nextSibling(ctx: Ctx): Node | null {
	return ctx.parent && ctx.index < ctx.parent.childCount - 1 ? ctx.parent.child(ctx.index + 1) : null;
}

/** an item's blocks; in a tight list a sub-list sits right under the item text, since a blank line there would make the whole list loose */
function renderItemBody(item: Node, core: MarkdownSaveCore): string {
	const loose = !!item.attrs.loose;
	let out = '';
	item.forEach((child, _offset, i) => {
		let part = core.node(child, { parent: item, index: i, isLastChild: i === item.childCount - 1, inTableCell: false });
		const next = i + 1 < item.childCount ? item.child(i + 1) : null;
		if (!loose && next && child.type.name === 'paragraph' && core.interrupts(next)) part = part.replace(/\n+$/, '\n');
		out += part;
	});
	return out.replace(/\n+$/, '');
}

/** the item's number: the run's start plus how many items of the same list precede it */
function itemNumber(node: Node, ctx: Ctx): number {
	let first = node;
	let distance = 0;
	if (ctx.parent) {
		for (let i = ctx.index - 1; i >= 0; i--) {
			const prev = ctx.parent.child(i);
			if (!sameList(prev, first)) break;
			first = prev;
			distance++;
		}
	}
	return Number(first.attrs.order ?? 1) + distance;
}

export const list: MarkdownPlugin = {
	import: { blocks: { BulletList: readList, OrderedList: readList } },
	// what Markdown records about a list that the shared spec does not: the delimiter as written (`-` `*` `+`, or `.`
	// `)`; null on a node the editor made) and whether the items are separated by blank lines
	schema({ nodes, marks }) {
		const base = nodes.get('list')!;
		return {
			nodes: nodes.update('list', { ...base, attrs: { ...base.attrs, marker: { default: null }, loose: { default: false } } }),
			marks
		};
	},
	save: {
		nodes: {
			list(node, ctx, core) {
				const marker = listMarker(node);
				const head = listFamily(node) === 'ordered' ? `${itemNumber(node, ctx)}${marker} ` : `${marker} `;
				// a task box is read off the item's first words: one opening with a nested list has none to tick
				const box = node.attrs.kind === 'task' && node.firstChild?.isTextblock ? `[${node.attrs.checked ? 'x' : ' '}] ` : '';
				// continuation lines align under the content, after the marker
				const body = indentAfterFirstLine(renderItemBody(node, core), ' '.repeat(head.length));
				const next = nextSibling(ctx);
				const sep = next && sameList(node, next) ? (node.attrs.loose ? '\n\n' : '\n') : '\n\n';
				return (head + box + body).replace(/ +$/, '') + sep;
			}
		},
		// an empty item or an ordered list not starting at 1 does not interrupt a paragraph
		interrupts: (node) =>
			node.type.name === 'list' &&
			node.textContent.trim() !== '' &&
			(listFamily(node) !== 'ordered' || Number(node.attrs.order ?? 1) === 1),
		// a task item's box is written with its marker, from the item's attrs: the first block of the item cannot be
		// rendered on its own inside the item's frame, whose bytes hold the box
		spliceChild: (parent, index) => !(parent.type.name === 'list' && index === 0 && parent.attrs.kind === 'task')
	}
};
