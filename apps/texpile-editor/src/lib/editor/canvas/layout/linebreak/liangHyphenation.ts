// Liang's hyphenation, as TeX does it: patterns vote on every gap between two letters
export type Hyphenator = {
	/** offsets into the lowercase word where it may be split, in order */
	(word: string): number[];
};

export type HyphenationRules = {
	/** TeX pattern list, one per line: letters with digits between them, a dot for a word edge */
	patterns: string;
	/** whole words split by hand, one per line, with a hyphen at every allowed place */
	exceptions: string;
	/** fewest letters left before the first split and after the last one */
	leftMin: number;
	rightMin: number;
};

function parsePatterns(text: string): { votes: Map<string, number[]>; longest: number } {
	const votes = new Map<string, number[]>();
	let longest = 0;
	for (const line of text.split(/\s+/)) {
		if (!line) continue;
		const letters = line.replace(/\d/g, '');
		const points = new Array<number>(letters.length + 1).fill(0);
		let at = 0;
		for (const char of line) {
			if (char >= '0' && char <= '9') points[at] = Number(char);
			else at++;
		}
		votes.set(letters, points);
		longest = Math.max(longest, letters.length);
	}
	return { votes, longest };
}

function parseExceptions(text: string): Map<string, number[]> {
	const splits = new Map<string, number[]>();
	for (const line of text.split(/\s+/)) {
		if (!line) continue;
		const points: number[] = [];
		let at = 0;
		for (const char of line) {
			if (char === '-') points.push(at);
			else at++;
		}
		splits.set(line.replace(/-/g, ''), points);
	}
	return splits;
}

export function createHyphenator(rules: HyphenationRules): Hyphenator {
	const { votes, longest } = parsePatterns(rules.patterns);
	const exceptions = parseExceptions(rules.exceptions);
	const known = new Map<string, number[]>();

	function split(word: string): number[] {
		const listed = exceptions.get(word);
		if (listed) return listed;
		const dotted = `.${word}.`;
		const levels = new Array<number>(dotted.length + 1).fill(0);
		for (let start = 0; start < dotted.length; start++) {
			const limit = Math.min(longest, dotted.length - start);
			for (let length = 1; length <= limit; length++) {
				const points = votes.get(dotted.slice(start, start + length));
				if (!points) continue;
				for (let i = 0; i < points.length; i++) if (points[i] > levels[start + i]) levels[start + i] = points[i];
			}
		}
		const out: number[] = [];
		// levels[i + 1] sits before word[i]; an odd level allows the split
		for (let i = rules.leftMin; i <= word.length - rules.rightMin; i++) if (levels[i + 1] % 2 === 1) out.push(i);
		return out;
	}

	return (word) => {
		let points = known.get(word);
		if (!points) {
			if (known.size > 20000) known.clear();
			points = split(word);
			known.set(word, points);
		}
		return points;
	};
}
