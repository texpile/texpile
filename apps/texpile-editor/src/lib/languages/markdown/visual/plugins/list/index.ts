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
				const box = node.attrs.kind === 'task' && node.firstChild?.isTextblock ? `[${node.attrs.checked ? 'x' : ' '}] ` : '';
				const body = indentAfterFirstLine(renderItemBody(node, core), ' '.repeat(head.length));
				const next = nextSibling(ctx);
				const sep = next && sameList(node, next) ? (node.attrs.loose ? '\n\n' : '\n') : '\n\n';
				return (head + box + body).replace(/ +$/, '') + sep;
			}
		},
		interrupts: (node) =>
			node.type.name === 'list' &&
			node.textContent.trim() !== '' &&
			(listFamily(node) !== 'ordered' || Number(node.attrs.order ?? 1) === 1),
		// a task item's box is written with its marker, so the first block cannot be rendered alone in the item's frame
		spliceChild: (parent, index) => !(parent.type.name === 'list' && index === 0 && parent.attrs.kind === 'task'),
		tight: (prev, next) => sameList(prev, next) && !prev.attrs.loose
	}
};
