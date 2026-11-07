import { List, ListCollapse, ListOrdered } from '@lucide/svelte';
import type { Component } from 'svelte';
import type { ListAttributes } from 'prosemirror-flat-list';
import { wrapInListItems, type LatexInsertContext, type LatexInsertOffer } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';

type ListKind = { kind: 'bullet' | 'ordered'; envName: string | null; label: string; icon: Component };

function offer(name: string, list: ListKind, hint: string | undefined): LatexInsertOffer {
	const attrs = { kind: list.kind, order: list.kind === 'ordered' ? 1 : null, checked: null, collapsed: false, envName: list.envName };
	return {
		id: name,
		label: list.label,
		icon: list.icon,
		category: 'lists',
		hint,
		shape: 'block',
		style: true,
		select: 'in',
		make: (s) => s.nodes.list.create(attrs, s.nodes.paragraph.create()),
		turn: wrapInListItems(attrs as unknown as ListAttributes),
		is: (node) => node.type.name === 'list' && node.attrs.kind === list.kind && (node.attrs.envName ?? null) === list.envName
	};
}

function kindOf(name: string): ListKind {
	if (name === 'itemize') return { kind: 'bullet', envName: null, label: m.blockmenu_bullet_list(), icon: List };
	if (name === 'enumerate') return { kind: 'ordered', envName: null, label: m.blockmenu_numbered_list(), icon: ListOrdered };
	return { kind: 'bullet', envName: name, label: name === 'description' ? m.insert_list_description() : name, icon: ListCollapse };
}

export function listInserts(ctx: LatexInsertContext): LatexInsertOffer[] {
	const lists = ctx.environments().filter((e) => e.item?.length && e.name !== 'thebibliography');
	const offered = lists.filter(
		(e) =>
			['itemize', 'enumerate', 'description'].includes(e.name) ||
			(e.item?.includes('item') && ctx.hint(e) && !(e.args ?? []).some((a) => /^[mr]/.test(a.kind)))
	);
	const covers = lists.map((l) => l.name);
	return offered.map((e) => ({ ...offer(e.name, kindOf(e.name), ctx.hint(e)), covers }));
}
