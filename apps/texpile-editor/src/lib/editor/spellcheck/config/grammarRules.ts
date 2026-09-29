// which English the checker follows, and which of its rules run

export const ENGLISH_VARIANTS = ['american', 'british', 'australian', 'canadian', 'indian'] as const;
export type EnglishVariant = (typeof ENGLISH_VARIANTS)[number];

/** off by default: over eight arXiv papers these flagged LaTeX or a paper's ordinary language, not mistakes */
export const QUIET_RULES: readonly string[] = [
	// source spacing and dashes that TeX and Typst fold: two spaces after a full stop, `pages 770--778`
	'Spaces',
	'NoFrenchSpaces',
	'Dashes',
	'NumericRangeEnDash',
	// a field's vocabulary: softmax as "soft max", FLOPs, multi-layer, data set, "sentence B" read as bytes
	'SplitWords',
	'OrthographicConsistency',
	'DisjointPrefixes',
	'CompoundNouns',
	'ExpandMemoryShorthands',
	'ExpandParameter',
	'ExpandMinimum',
	// words around a reference or formula: "Fig.~\ref{a} shows" starts with "shows", "Let $x$ be" reads as let's
	'SentenceCapitalization',
	'LetsConfusion',
	'Overall',
	// house style, not mistakes: long sentences, the Oxford comma, "Thus we", "all of the"
	'LongSentences',
	'OxfordComma',
	'DiscourseMarkers',
	'MoreAdjective',
	'CondenseAllThe'
];

/** the rule that checks spelling; turned off from one word, it would take every word with it */
export const SPELLING_RULE = 'SpellCheck';

export function ruleIsOn(rule: string, choices: Readonly<Record<string, boolean>>): boolean {
	return choices[rule] ?? !QUIET_RULES.includes(rule);
}

/** a config for every rule, since Harper replaces the last one whole; null keeps a rule at Harper's default */
export function ruleConfig(rules: readonly string[], choices: Readonly<Record<string, boolean>>): Record<string, boolean | null> {
	const config: Record<string, boolean | null> = Object.fromEntries(rules.map((r) => [r, null]));
	for (const r of QUIET_RULES) if (r in config) config[r] = false;
	for (const [r, on] of Object.entries(choices)) if (r in config) config[r] = on;
	return config;
}

/** the first English system language decides; Harper has no New Zealand, Irish or South African English */
export function systemVariant(languages: readonly string[]): EnglishVariant {
	for (const tag of languages) {
		const [lang, region = ''] = tag.toLowerCase().split(/[-_]/);
		if (lang !== 'en') continue;
		if (region === 'us' || region === '' || region === 'pr' || region === 'ph') return 'american';
		if (region === 'au') return 'australian';
		if (region === 'ca') return 'canadian';
		if (region === 'in') return 'indian';
		return 'british';
	}
	return 'american';
}

/** a rule's name as words: OxfordComma is Oxford Comma */
export function ruleName(rule: string): string {
	return rule.replace(/([a-z\d])([A-Z])|([A-Z])([A-Z][a-z])/g, '$1$3 $2$4');
}
