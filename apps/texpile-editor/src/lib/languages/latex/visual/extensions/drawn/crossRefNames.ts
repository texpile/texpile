// the words \cref, \Cref and \autoref print before a number: the packages' own defaults, then what the preamble renames
import { commandsWith, commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import { conditionHolds, type LoadedFile } from '$lib/languages/latex/knowledge/loadedFiles';
import { commonRegistry, itemsUnder, loadedRegistry } from '$lib/languages/latex/knowledge/registries/registries';
import { stackedCommands } from '$lib/languages/latex/knowledge/stackedEntries';

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

// \crefname{figure}{Fig.}{Figs.}, with any spacing
const CREFNAME = /\\(crefname|Crefname)\s*\{([^{}]+)\}\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g;
// \renewcommand{\sectionautorefname}{Section}, \def\sectionautorefname{Section}, and the starred and braceless forms
const AUTOREFNAME = /\\(?:(?:re)?newcommand\*?|providecommand\*?|def)\s*\{?\s*\\([a-zA-Z]+)autorefname\s*\}?\s*\{([^{}]*)\}/g;

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
	for (const m of preamble.matchAll(CREFNAME)) {
		const pair: [string, string] = [m[3].trim(), m[4].trim()];
		if (m[1] === 'crefname') {
			cref[m[2]] = pair;
			if (!renamed.has(m[2])) Cref[m[2]] = capitalisedPair(pair);
		} else {
			Cref[m[2]] = pair;
			renamed.add(m[2]);
		}
	}
	for (const m of preamble.matchAll(AUTOREFNAME)) autoref[m[1]] = m[2].trim();
	return { cref, Cref, autoref };
}

export const DEFAULT_CROSS_REF_NAMES = crossRefNamesFromPreamble('');
