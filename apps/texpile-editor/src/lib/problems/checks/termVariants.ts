// one term written two ways across the document: dataset and data set, Fig. and Figure
export type ProseFile = { path: string; prose: string };

/** preferred: the way most of the document writes it, as written there */
export type TermVariant = { file: string; at: number; words: string; preferred: string };

type Form = 'closed' | 'spaced' | 'hyphen' | 'short' | 'full';
type Use = { file: string; at: number; words: string; form: Form };

// a verb and its particle (set up, log in) or a pronoun phrase (every one) means something else closed up
const SPACED_SECOND_STOP = new Set([
	'up',
	'out',
	'off',
	'on',
	'in',
	'to',
	'into',
	'onto',
	'down',
	'over',
	'back',
	'away',
	'through',
	'time',
	'one',
	'day',
	'way',
	'body',
	'thing',
	'where',
	'how',
	'ever',
	'self',
	'times',
	'more',
	'less',
	'not'
]);
const ABBREVIATIONS: Record<string, string> = { Fig: 'Figure', Eq: 'Equation', Sec: 'Section', Tab: 'Table' };
const SHORTEST_CLOSED = 5;
const SHORTEST_SPACED_PART = 3;

function isLetter(ch: string | undefined): boolean {
	return !!ch && ch.toLowerCase() !== ch.toUpperCase();
}

function isBlank(ch: string): boolean {
	return ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r';
}

type Token = { at: number; end: number; text: string };

function tokensOf(prose: string): Token[] {
	const out: Token[] = [];
	let i = 0;
	while (i < prose.length) {
		if (!isLetter(prose[i])) {
			i++;
			continue;
		}
		const at = i;
		while (isLetter(prose[i])) i++;
		out.push({ at, end: i, text: prose.slice(at, i) });
	}
	return out;
}

/** the sentence goes on before `at`: a word or a comma comes first, not a full stop or a blank line */
function midSentence(prose: string, at: number): boolean {
	let i = at - 1;
	let newlines = 0;
	while (i >= 0 && isBlank(prose[i])) if (prose[i--] === '\n') newlines++;
	if (i < 0 || newlines > 1) return false;
	return !['.', '!', '?', ':'].includes(prose[i]);
}

function usesIn(file: ProseFile, add: (key: string, use: Use) => void): void {
	const { prose, path } = file;
	const tokens = tokensOf(prose);
	for (let k = 0; k < tokens.length; k++) {
		const t = tokens[k];
		const next = tokens[k + 1];
		const lower = t.text.toLowerCase();
		if (t.text in ABBREVIATIONS && prose[t.end] === '.' && midSentence(prose, t.at))
			add(t.text, { file: path, at: t.at, words: t.text + '.', form: 'short' });
		const short = Object.keys(ABBREVIATIONS).find((s) => ABBREVIATIONS[s] === t.text);
		if (short && midSentence(prose, t.at)) add(short, { file: path, at: t.at, words: t.text, form: 'full' });
		if (lower.length >= SHORTEST_CLOSED && prose[t.at - 1] !== '-' && prose[t.end] !== '-')
			add(lower, { file: path, at: t.at, words: t.text, form: 'closed' });
		if (!next) continue;
		const between = prose.slice(t.end, next.at);
		const second = next.text.toLowerCase();
		if (between === '-' && prose[t.at - 1] !== '-' && prose[next.end] !== '-' && second.length >= 2)
			add(lower + second, { file: path, at: t.at, words: prose.slice(t.at, next.end), form: 'hyphen' });
		else if (
			between.length > 0 &&
			[...between].every(isBlank) &&
			lower.length >= SHORTEST_SPACED_PART &&
			second.length >= SHORTEST_SPACED_PART &&
			!SPACED_SECOND_STOP.has(second)
		)
			add(lower + second, { file: path, at: t.at, words: prose.slice(t.at, next.end), form: 'spaced' });
	}
}

function capitalLike(written: string, preferred: string): string {
	if (written[0] === written[0].toUpperCase() && written[0] !== written[0].toLowerCase())
		return preferred[0].toUpperCase() + preferred.slice(1);
	return preferred;
}

export function termVariants(files: ProseFile[]): TermVariant[] {
	const keyed = new Map<string, Use[]>();
	for (const f of files)
		usesIn(f, (key, use) => {
			const found = keyed.get(key);
			if (found) found.push(use);
			else keyed.set(key, [use]);
		});
	const out: TermVariant[] = [];
	for (const uses of keyed.values()) {
		const counts = new Map<Form, number>();
		for (const u of uses) counts.set(u.form, (counts.get(u.form) ?? 0) + 1);
		if (counts.size < 2) continue;
		// a tie keeps the closed word and the abbreviation
		const order: Form[] = ['closed', 'short', 'hyphen', 'full', 'spaced'];
		const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))[0][0];
		const preferred = uses.find((u) => u.form === top)!.words;
		for (const u of uses) {
			if (u.form === top) continue;
			const shown = top === 'short' || top === 'full' ? preferred : capitalLike(u.words, preferred.toLowerCase());
			out.push({ file: u.file, at: u.at, words: u.words, preferred: shown });
		}
	}
	return out;
}
