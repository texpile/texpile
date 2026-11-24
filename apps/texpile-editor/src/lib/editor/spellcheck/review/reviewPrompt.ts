// What a proofread sends the model and how its answer is read back
import { settings } from '$lib/settings';
import { browser } from '$lib/runtime';
import { systemVariant } from '../config/grammarRules';
import type { SpellLanguage } from '../languages/spellLanguages';
import { readableSpellText } from '../blockSpellText';
import type { HarperVerdict, OwnFinding, ParagraphReview, ReviewTarget } from './reviewTypes';

/** raised when the prompt changes, so reviews made under the old one are asked again */
export const PROMPT_VERSION = 3;

const VARIANT_NAMES = { american: 'American', british: 'British', australian: 'Australian', canadian: 'Canadian', indian: 'Indian' };

export function englishVariant(): keyof typeof VARIANT_NAMES {
	return settings.current.englishVariant || systemVariant(browser ? navigator.languages : []);
}

function languageName(tag: string): string {
	try {
		return new Intl.DisplayNames(['en'], { type: 'language' }).of(tag) ?? tag;
	} catch {
		return tag;
	}
}

export function reviewSystem(language: SpellLanguage): string {
	const written = language === 'en' ? `${VARIANT_NAMES[englishVariant()]} English` : languageName(language);
	const reasons = languageName(settings.current.uiLocale || 'en');
	return `You proofread paragraphs of a paper or technical document written in ${written}. Formulas, references and commands are shown as $x$. Leave them alone and never quote one.

Each paragraph comes with the findings of a rule-based spelling and grammar checker. It often flags field vocabulary, names, abbreviations and the words around a formula. Give each finding a verdict:
- "drop" when it is not a mistake in this context.
- "term" when it is a spelling finding on a correctly written name, abbreviation or term of the field.
- "replace" when the mistake is real and a better replacement exists. Put it in "replacement".
- "keep" otherwise, with an empty "replacement".

Then add at most three findings of your own per paragraph, for mistakes the checker missed:
- "grammar": a real grammar, agreement, article, tense or punctuation mistake.
- "wording": a wrong or clearly clumsy word choice, a redundant phrase or an unclear sentence.
"quote" is the shortest span of the paragraph that "replacement" replaces, copied character for character and long enough to occur once. "reason" is one short sentence in ${reasons}. Leave house style alone: long sentences, the Oxford comma, technical terms and the author's voice. Spelling and grammar follow ${written}. When unsure, add nothing.

Answer with JSON alone, in this shape:
{"paragraphs":[{"id":0,"findings":[{"id":0,"verdict":"keep","replacement":""}],"own":[{"quote":"","replacement":"","kind":"wording","reason":""}]}]}
Give every paragraph by its id, and every finding by its id.`;
}

export function reviewRequest(targets: readonly ReviewTarget[]): string {
	return JSON.stringify({
		paragraphs: targets.map((t, id) => ({
			id,
			text: t.reading().text,
			findings: t.matches.map((m, fid) => ({
				id: fid,
				text: readableSpellText(t.linted.slice(m.offset, m.offset + m.length)),
				message: m.message,
				suggestions: (m.replacements ?? []).slice(0, 3)
			}))
		}))
	});
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null;
}

function verdictOf(v: unknown): [number, HarperVerdict] | null {
	if (!isRecord(v) || typeof v.id !== 'number') return null;
	if (v.verdict !== 'keep' && v.verdict !== 'drop' && v.verdict !== 'replace' && v.verdict !== 'term') return null;
	const replacement = typeof v.replacement === 'string' ? v.replacement : '';
	return [v.id, v.verdict === 'replace' && !replacement ? { verdict: 'keep', replacement } : { verdict: v.verdict, replacement }];
}

function ownOf(v: unknown): OwnFinding | null {
	if (!isRecord(v) || typeof v.quote !== 'string' || typeof v.replacement !== 'string' || !v.quote.trim()) return null;
	const kind = v.kind === 'grammar' ? 'grammar' : 'wording';
	return { quote: v.quote, replacement: v.replacement, kind, reason: typeof v.reason === 'string' ? v.reason : '' };
}

/** by paragraph id; an agent may wrap its JSON in a code fence or a sentence */
export function parseReview(answer: string): Map<number, ParagraphReview> | null {
	const from = answer.indexOf('{');
	const to = answer.lastIndexOf('}');
	if (from < 0 || to < from) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(answer.slice(from, to + 1));
	} catch {
		return null;
	}
	if (!isRecord(parsed) || !Array.isArray(parsed.paragraphs)) return null;
	const out = new Map<number, ParagraphReview>();
	for (const p of parsed.paragraphs) {
		if (!isRecord(p) || typeof p.id !== 'number') continue;
		const verdicts = new Map((Array.isArray(p.findings) ? p.findings : []).map(verdictOf).filter((v) => v !== null));
		const own = (Array.isArray(p.own) ? p.own : [])
			.map(ownOf)
			.filter((o) => o !== null)
			.slice(0, 3);
		out.set(p.id, { verdicts, own });
	}
	return out;
}
