// The Typst template gallery's search: every word typed has to match somewhere, and a match in the
// name ranks above one in the description.
import type { UniverseTemplate } from '../templateBridge.types';

function words(query: string): string[] {
	return query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
}

/** lower is better; null when a word matches nowhere */
function rank(t: UniverseTemplate, terms: string[]): number | null {
	const name = t.name.toLocaleLowerCase();
	const tags = [...t.keywords, ...t.categories].map((k) => k.toLocaleLowerCase());
	const rest = [t.description, ...t.authors].join('\n').toLocaleLowerCase();
	let worst = 0;
	for (const term of terms) {
		let score: number | null = null;
		if (name === term) score = 0;
		else if (name.startsWith(term)) score = 1;
		else if (name.includes(term)) score = 2;
		else if (tags.some((k) => k.includes(term))) score = 3;
		else if (rest.includes(term)) score = 4;
		if (score === null) return null;
		worst = Math.max(worst, score);
	}
	return worst;
}

/** the templates matching `query`, best first; all of them, in order, for an empty query */
export function filterUniverse(templates: readonly UniverseTemplate[], query: string): UniverseTemplate[] {
	const terms = words(query);
	if (!terms.length) return [...templates];
	const scored: { t: UniverseTemplate; score: number }[] = [];
	for (const t of templates) {
		const score = rank(t, terms);
		if (score !== null) scored.push({ t, score });
	}
	return scored.sort((a, b) => a.score - b.score || a.t.name.localeCompare(b.t.name)).map((s) => s.t);
}
