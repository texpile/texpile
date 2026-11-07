// the words \cref, \Cref and \autoref print before a number: the packages' own defaults, then what the preamble renames
import { commandsWith, commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import { conditionHolds, type LoadedFile } from '$lib/languages/latex/knowledge/loadedFiles';
import { commonRegistry, itemsUnder, loadedRegistry } from '$lib/languages/latex/knowledge/registries/registries';
import { stackedCommands } from '$lib/languages/latex/knowledge/stackedEntries';
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { groupInner, groupItems, nextItem, wordOf } from '$lib/languages/latex/syntax/treeSiblings';
import type { SyntaxNode } from '@lezer/common';

export type CrossRefNames = {
	/** cleveref's \crefname: counter to [singular, plural] */
	cref: Record<string, [string, string]>;
	/** cleveref's \Crefname */
	Cref: Record<string, [string, string]>;
	/** hyperref's \<counter>autorefname */
	autoref: Record<string, string>;
};

function capitalised(word: string): string {
	return word.charAt(0).toUpperCase() + word.slice(1);
}

function capitalisedPair([one, many]: [string, string]): [string, string] {
	return [capitalised(one), capitalised(many)];
}

// \renewcommand{\sectionautorefname}{Section}, \def\sectionautorefname{Section}, and the starred and braceless forms
const NAME_DEFINERS = new Set(['newcommand', 'renewcommand', 'providecommand', 'def']);
type RefNameDefinition =
	{ kind: 'crefname' | 'Crefname'; counter: string; pair: [string, string] } | { kind: 'autoref'; counter: string; word: string };

function groupsAfter(text: string, n: SyntaxNode, count: number): string[] | null {
	const out: string[] = [];
	for (let s = nextItem(text, n); s && out.length < count; s = nextItem(text, s)) {
		const inner = groupInner(text, s);
		if (inner === null) return null;
		out.push(inner);
	}
	return out.length === count ? out : null;
}

// \crefname{figure}{Fig.}{Figs.}
function refNameDefinitionsIn(preamble: string): RefNameDefinition[] {
	const out: RefNameDefinition[] = [];
	latexTreeOf(preamble).iterate({
		enter(n) {
			const word = wordOf(preamble, n.node);
			if (word === 'crefname' || word === 'Crefname') {
				const groups = groupsAfter(preamble, n.node, 3);
				if (groups && groups[0].trim()) out.push({ kind: word, counter: groups[0], pair: [groups[1].trim(), groups[2].trim()] });
			} else if (word && NAME_DEFINERS.has(word)) {
				let named = nextItem(preamble, n.node);
				if (named?.name === 'Text' && preamble.slice(named.from, named.to).trim() === '*') named = nextItem(preamble, named);
				const items = named?.name === 'Group' ? groupItems(preamble, named) : [named];
				const counter = items.length === 1 ? /^([a-zA-Z]+)autorefname$/.exec(wordOf(preamble, items[0]) ?? '')?.[1] : undefined;
				const printed = counter && named ? groupInner(preamble, nextItem(preamble, named)) : null;
				if (counter && printed !== null) out.push({ kind: 'autoref', counter, word: printed.trim() });
			}
		}
	});
	return out;
}

const AUTOREF_NAME = /^(.+)autorefname$/;

function wordsOf(entries: [string, string | null | undefined][]): Record<string, string> {
	const words: Record<string, string> = {};
	for (const [name, value] of entries) {
		const counter = AUTOREF_NAME.exec(name)?.[1];
		if (counter && value) words[counter] = value;
	}
	return words;
}

// a document whose files hold no names yet (its project still being read) reads the common ones
function autorefWords(loaded: LoadedFile[] | undefined): Record<string, string> {
	const own = loaded ? wordsOf([...stackedCommands(loaded)].map(([name, entry]) => [name, entry.value])) : {};
	const words = Object.keys(own).length ? own : wordsOf(commandsWith('value').map((name) => [name, commonFacts(name).value]));
	// the .aux names a list item's counter where hyperref names its type
	if (words.item) words.enumi = words.item;
	return words;
}

/** `loaded`: the files the document loads; absent, the reading of the files most documents load */
export function crossRefNamesFromPreamble(preamble: string, loaded?: LoadedFile[]): CrossRefNames {
	const own = loaded ? loadedRegistry(loaded, 'refNames') : [];
	const names = own.length ? own : itemsUnder(commonRegistry('refNames'), new Set());
	const capitalise = conditionHolds('capitalise|capitalize', loaded?.find((f) => f.name === 'cleveref')?.options ?? new Set());
	const cref: Record<string, [string, string]> = Object.fromEntries(
		names.map((n) => [n.name, capitalise ? [n.capital, n.capitalPlural] : [n.singular, n.plural]])
	);
	const Cref: Record<string, [string, string]> = Object.fromEntries(names.map((n) => [n.name, [n.capital, n.capitalPlural]]));
	const autoref = autorefWords(loaded);
	const renamed = new Set<string>();
	for (const d of refNameDefinitionsIn(preamble)) {
		if (d.kind === 'autoref') autoref[d.counter] = d.word;
		else if (d.kind === 'crefname') {
			cref[d.counter] = d.pair;
			if (!renamed.has(d.counter)) Cref[d.counter] = capitalisedPair(d.pair);
		} else {
			Cref[d.counter] = d.pair;
			renamed.add(d.counter);
		}
	}
	return { cref, Cref, autoref };
}

export const DEFAULT_CROSS_REF_NAMES = crossRefNamesFromPreamble('');
