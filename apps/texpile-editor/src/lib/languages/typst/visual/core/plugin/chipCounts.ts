// what a chip adds to each counter, in the order its calls stand: the number a call prints, or null for the counter's next
import type { SyntaxNode } from '@lezer/common';
import type { ChipCounts } from '$lib/editor/visual/extensions/drawnChips/footnoteNumbers';
import { typstPlugins } from '../../typstPlugins';
import { typstSyntax } from '../reading/typstCall';
import { listedPlugins } from './pluginMap';

const MOST_KEPT = 500;

const counted = new Map<string, ChipCounts>();
let countedNames: string[] | null = null;

function countsIn(top: SyntaxNode, source: string): ChipCounts {
	const out: ChipCounts = {};
	function visit(node: SyntaxNode): void {
		const callee = node.name === 'FuncCall' ? node.firstChild : null;
		if (callee) {
			const name = source.slice(callee.from, callee.to);
			for (const plugin of listedPlugins({ form: 'call', name })) {
				const args: string[] = [];
				for (let c = node.lastChild?.firstChild; c; c = c.nextSibling) args.push(c.name);
				for (const [key, count] of Object.entries(plugin.counts ?? {})) (out[key] ??= []).push(...count({ name, args }));
			}
		}
		for (let c = node.firstChild; c; c = c.nextSibling) visit(c);
	}
	visit(top);
	return out;
}

export function typstChipCounts(source: string): ChipCounts {
	countedNames ??= typstPlugins.flatMap((plugin) => (plugin.counts ? (plugin.functions ?? []) : []));
	if (!countedNames.some((name) => source.includes(name))) return {};
	let counts = counted.get(source);
	if (!counts) {
		counts = countsIn(typstSyntax(source), source);
		if (counted.size >= MOST_KEPT) counted.clear();
		counted.set(source, counts);
	}
	return counts;
}
