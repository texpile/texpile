// the custom dictionary's box, which searches the list and adds to it at once

/** lowercase, as the dictionary keeps them, each once */
export function wordsIn(input: string): string[] {
	return [
		...new Set(
			input
				.split(/[\s,;]+/)
				.map((w) => w.trim().toLowerCase())
				.filter(Boolean)
		)
	];
}

export function matching(words: readonly string[], query: string): string[] {
	const sorted = [...words].sort((a, b) => a.localeCompare(b));
	const q = query.trim().toLowerCase();
	if (!q) return sorted;
	return [...sorted.filter((w) => w.startsWith(q)), ...sorted.filter((w) => !w.startsWith(q) && w.includes(q))];
}
