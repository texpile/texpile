// \newlabel{name}{{number}{page}{title}{anchor}{}}: the last three are hyperref's; cleveref adds a name@cref twin
// whose number reads [counter][...]..., the only place the counter's name is written when hyperref is absent
const NEWLABEL = /\\newlabel\{([^{}]+)\}\{/g;

export type AuxLabels = {
	numbers: Record<string, string>;
	pages: Record<string, string>;
	/** the counter a label numbers (figure, table, equation, section ...), for the words \cref and \autoref print */
	kinds: Record<string, string>;
	/** the title hyperref recorded, for \nameref */
	titles: Record<string, string>;
};

/** the brace groups in `aux` from `at` (just inside an opening brace) to its close, as their inner text */
export function groupsFrom(aux: string, at: number): string[] {
	const groups: string[] = [];
	let depth = 0;
	let start = -1;
	for (let i = at; i < aux.length; i++) {
		const c = aux[i];
		if (c === '\\') i++;
		else if (c === '{') {
			if (depth === 0) start = i + 1;
			depth++;
		} else if (c === '}') {
			if (depth === 0) return groups;
			depth--;
			if (depth === 0) groups.push(aux.slice(start, i));
		} else if (c === '\n' && depth === 0) return groups;
	}
	return groups;
}

/** The numbers, pages, counters and titles the last compile recorded for every label, straight out of the .aux. */
export function parseAuxLabels(aux: string): AuxLabels {
	const found: AuxLabels = { numbers: {}, pages: {}, kinds: {}, titles: {} };
	NEWLABEL.lastIndex = 0;
	for (let m = NEWLABEL.exec(aux); m; m = NEWLABEL.exec(aux)) {
		const [number = '', page = '', title = '', anchor = ''] = groupsFrom(aux, m.index + m[0].length);
		const twin = /^(.*)@cref$/.exec(m[1]);
		if (twin) {
			const counter = /^\[([^\]]*)\]/.exec(number)?.[1];
			if (counter) found.kinds[twin[1]] = counter;
			continue;
		}
		found.numbers[m[1]] = number;
		found.pages[m[1]] = page;
		if (title) found.titles[m[1]] = title;
		const counter = /^([a-zA-Z*]+)\./.exec(anchor)?.[1];
		if (counter && !(m[1] in found.kinds)) found.kinds[m[1]] = counter;
	}
	return found;
}
