// ranks title search hits on what was typed; the sources' own relevance puts the right paper twentieth

export type SearchHit = CiteSearchHit;

// words a title search carries that say nothing about which paper is meant
const STOP = new Set(['a', 'an', 'the', 'of', 'for', 'and', 'in', 'on', 'to', 'with', 'by', 'at', 'from', 'is', 'are', 'via', 'as']);

export function rankHits(query: string, hits: readonly SearchHit[], limit = 8): SearchHit[] {
	const typed = words(query);
	const years = typed.filter(isYear);
	const terms = typed.filter((w) => !isYear(w));

	const scored = hits.map((hit) => {
		const title = words(hit.title);
		const inTitle = new Set(title);
		const surnames = new Set(hit.authors.flatMap(words));
		// a word that is a surname and not a title word was typed for the author
		const byAuthor = terms.filter((t) => surnames.has(t) && !inTitle.has(t));
		const forTitle = terms.filter((t) => !byAuthor.includes(t));
		const significant = forTitle.filter((t) => !STOP.has(t));
		const covered = significant.length ? significant.filter((t) => inTitle.has(t)).length / significant.length : 0;
		const phrase = forTitle.join(' ');
		const whole = title.join(' ');
		const exact = phrase && whole === phrase ? 1 : phrase && whole.startsWith(`${phrase} `) ? 0.5 : 0;
		// title words the search does not have: containing the words is weaker in a long title
		const extra = title.filter((w) => !STOP.has(w) && !terms.includes(w)).length;
		const score =
			3 * exact +
			2 * covered +
			(byAuthor.length ? 1 : 0) +
			(years.includes(hit.year) ? 1 : 0) +
			0.3 * Math.log10(1 + hit.cites) -
			0.05 * extra;
		const version = `${whole}\u0000${words(hit.authors[0] ?? '').join(' ')}`;
		return { hit, whole, version, score };
	});

	// versions of one work: the earliest is the original
	const earliest = new Map<string, number>();
	for (const s of scored) {
		const year = Number(s.hit.year) || Infinity;
		earliest.set(s.whole, Math.min(earliest.get(s.whole) ?? Infinity, year));
	}
	for (const s of scored) if ((Number(s.hit.year) || Infinity) === earliest.get(s.whole)) s.score += 1;

	// two versions of a work at most: the paper and its preprint, not a fourth re-upload
	const seen = new Set<string>();
	const versions = new Map<string, number>();
	return scored
		.sort((a, b) => b.score - a.score)
		.filter(({ hit, version }) => {
			const doi = hit.doi.toLowerCase();
			const shown = versions.get(version) ?? 0;
			if (seen.has(doi) || shown >= 2) return false;
			seen.add(doi);
			versions.set(version, shown + 1);
			return true;
		})
		.map((s) => s.hit)
		.slice(0, limit);
}

/** lower-case words with accents folded, so "Schrödinger" finds "Schrodinger" */
function words(s: string): string[] {
	return (
		s
			.normalize('NFD')
			.replace(/\p{M}/gu, '')
			.toLowerCase()
			.match(/[\p{L}\p{N}]+/gu) ?? []
	);
}

function isYear(w: string): boolean {
	return /^(1[5-9]|20)\d\d$/.test(w);
}
