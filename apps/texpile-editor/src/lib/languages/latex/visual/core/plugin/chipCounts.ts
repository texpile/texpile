import type { ChipCounts } from '$lib/editor/visual/extensions/drawnChips/footnote/footnoteNumbers';
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { nextItem, wordOf } from '$lib/languages/latex/syntax/treeSiblings';
import { startsTitleBlock } from '$lib/languages/latex/titleParts';
import { documentTable } from '../title/documentTable.svelte';
import { commandPlugins } from './pluginMap';
import type { LatexCountedCall } from './latexPlugin';

const WORD = /\\([a-zA-Z@]+)/g;

function counts(name: string) {
	return commandPlugins(name).flatMap((plugin) => (plugin.counts ? [plugin.counts] : []));
}

// the count runs on every edit over every chip, and a long paper's chips outnumber the trees kept for short texts
const KEPT_CHIPS = 20_000;
const known = new WeakMap<object, Map<string, ChipCounts>>();

export function chipCounts(source: string): ChipCounts {
	const table = documentTable.current;
	let memo = known.get(table);
	if (!memo) known.set(table, (memo = new Map()));
	let found = memo.get(source);
	if (!found) {
		if (memo.size > KEPT_CHIPS) memo.clear();
		memo.set(source, (found = countsIn(source, table)));
	}
	return found;
}

function countsIn(source: string, table: typeof documentTable.current): ChipCounts {
	// the title block numbers its notes with symbols and starts the page footnotes again
	if (startsTitleBlock(source, table)) return {};
	if (![...source.matchAll(WORD)].some((m) => counts(m[1]).length)) return {};
	const out: ChipCounts = {};
	latexTreeOf(source).iterate({
		enter(n) {
			const name = wordOf(source, n.node);
			const counters = name ? counts(name) : [];
			if (!counters.length) return;
			const open = nextItem(source, n.node);
			const number = open?.name === 'OpenBracket' ? open.nextSibling : null;
			const digits =
				number?.name === 'Text' && number.nextSibling?.name === 'CloseBracket' ? source.slice(number.from, number.to).trim() : '';
			const call: LatexCountedCall = { name: name!, given: /^\d+$/.test(digits) ? Number(digits) : null };
			for (const counter of counters) for (const [key, count] of Object.entries(counter)) (out[key] ??= []).push(...count(call));
		}
	});
	return out;
}
