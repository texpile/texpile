// Harper's findings with the model's review applied: the ones on words it kept dropped, its changes added
import { tagReplacements, type LintMatch } from '../linter';
import { ruleIsOn } from '../config/grammarRules';
import type { SpellLanguage } from '../languages/spellLanguages';
import type { OwnFinding, ParagraphReview, ReviewReading, ReviewTarget } from './reviewTypes';
import { changeTitle } from './rewrite/changeTitles';

/** the rules the model's own findings go under, so the suggestion box can turn them off like any of Harper's */
export const AI_RULES = { grammar: 'AIGrammar', wording: 'AIWording' } as const;

// a quote over a formula would replace the formula with words
const OVER_FORMULA = /\$x\$/;

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** the quote in the reading, as written or with its spaces read loosely; the first occurrence */
export function findQuote(reading: string, quote: string): { offset: number; length: number } | null {
	const at = reading.indexOf(quote);
	if (at >= 0) return { offset: at, length: quote.length };
	const loose = new RegExp(quote.trim().split(/\s+/).map(escapeRegExp).join('\\s+'));
	const found = loose.exec(reading);
	return found ? { offset: found.index, length: found[0].length } : null;
}

function ownMatch(reading: ReviewReading, own: OwnFinding, language: SpellLanguage): LintMatch | null {
	if (own.replacement === own.quote || OVER_FORMULA.test(own.quote) || OVER_FORMULA.test(own.replacement)) return null;
	// a review carried through an edit finds its quotes again
	const span =
		reading.text.slice(own.at, own.at + own.quote.length) === own.quote
			? { offset: own.at, length: own.quote.length }
			: findQuote(reading.text, own.quote);
	if (!span) return null;
	const rule = AI_RULES[own.kind];
	const replacements = [own.replacement];
	tagReplacements(replacements, { rule, language });
	const message = own.reason || changeTitle(own.change);
	return {
		...reading.toLinted(span.offset, span.length),
		message,
		shortMessage: message,
		type: { typeName: own.change === 'spelling' ? 'Spelling' : own.kind === 'wording' ? 'WordChoice' : 'Grammar' },
		replacements,
		rule
	};
}

function overlaps(a: LintMatch, b: LintMatch): boolean {
	return a.offset < b.offset + b.length && b.offset < a.offset + a.length;
}

export function mergeReview(target: ReviewTarget, review: ParagraphReview, rules: Readonly<Record<string, boolean>>): LintMatch[] {
	const kept: LintMatch[] = [];
	target.matches.forEach((match, id) => {
		if (!review.verdicts.has(id)) kept.push(match);
	});
	const wanted = review.own.filter((o) => ruleIsOn(AI_RULES[o.kind], rules));
	const read = wanted.length ? target.reading() : null;
	const own = wanted
		.map((o) => ownMatch(read!, o, target.language))
		.filter((m): m is LintMatch => m !== null && m.length > 0 && !kept.some((k) => overlaps(k, m)));
	return [...kept, ...own].sort((a, b) => a.offset - b.offset || a.length - b.length);
}
