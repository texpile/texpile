// what \cref, \Cref, \autoref, \pageref and \nameref print, from what the last compile wrote to the .aux. A label the
// .aux does not know prints as itself, the way a \ref chip does
import type { CrossRefNames } from '$lib/languages/latex/visual/core';
export type CrossRefAux = {
	numbers: Record<string, string>;
	pages: Record<string, string>;
	kinds: Record<string, string>;
	titles: Record<string, string>;
};

export type CrossRefText = { text: string; known: boolean };

function listed(items: string[]): string {
	return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function cleverefText(labels: string[], aux: CrossRefAux, names: Record<string, [string, string]>): string {
	// consecutive labels of one kind share their word, in the plural when there are several
	const runs: Array<{ kind: string; numbers: string[] }> = [];
	for (const label of labels) {
		const kind = aux.kinds[label] ?? '';
		const number = aux.numbers[label];
		const shown = number === undefined ? label : kind === 'equation' ? `(${number})` : number;
		const last = runs[runs.length - 1];
		if (last && last.kind === kind) last.numbers.push(shown);
		else runs.push({ kind, numbers: [shown] });
	}
	return listed(
		runs.map(({ kind, numbers }) => {
			const word = names[kind]?.[numbers.length > 1 ? 1 : 0];
			return word ? `${word}\u00a0${listed(numbers)}` : listed(numbers);
		})
	);
}

function rangeText(bare: string, [first, last]: string[], aux: CrossRefAux, names: CrossRefNames): string {
	if (/page/i.test(bare)) return `${aux.pages[first] || first} to ${aux.pages[last] || last}`;
	const kind = aux.kinds[first] ?? '';
	function shown(label: string): string {
		return aux.numbers[label] === undefined ? label : kind === 'equation' ? `(${aux.numbers[label]})` : aux.numbers[label];
	}
	const numbers = `${shown(first)} to ${shown(last)}`;
	const base = bare.replace(/range$/, '');
	const word = base === 'cref' || base === 'Cref' ? names[base][kind]?.[1] : undefined;
	return word ? `${word}\u00a0${numbers}` : numbers;
}

export function crossRefText(command: string, labels: string[], aux: CrossRefAux, names: CrossRefNames, range = false): CrossRefText {
	const known = labels.every((label) => label in aux.numbers);
	const bare = command.replace(/\*$/, '');
	if (range && labels.length === 2) return { text: rangeText(bare, labels, aux, names), known };
	if (bare === 'cref' || bare === 'Cref') return { text: cleverefText(labels, aux, names[bare]), known };
	const [label] = labels;
	if (!(label in aux.numbers)) return { text: label, known: false };
	if (bare === 'autoref' || bare === 'Autoref') {
		const word = names.autoref[aux.kinds[label] ?? ''];
		const shown = word && bare === 'Autoref' ? word.charAt(0).toUpperCase() + word.slice(1) : word;
		return { text: shown ? `${shown}\u00a0${aux.numbers[label]}` : aux.numbers[label], known };
	}
	if (/page/i.test(bare)) return { text: aux.pages[label] || label, known };
	if (bare === 'nameref' || bare === 'Nameref') return { text: aux.titles[label] || label, known };
	if (bare === 'eqref') return { text: `(${aux.numbers[label]})`, known };
	return { text: aux.numbers[label], known };
}
