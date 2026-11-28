// What a proofread sends the model and how its answer is read back: each sentence behind an id, rewritten
import { settings } from '$lib/settings';
import { browser } from '$lib/runtime';
import { systemVariant } from '../config/grammarRules';
import type { SpellLanguage } from '../languages/spellLanguages';
import type { ReviewTarget } from './reviewTypes';

/** raised when the prompt changes, so reviews made under the old one are asked again */
export const PROMPT_VERSION = 5;

const VARIANT_NAMES = { american: 'American', british: 'British', australian: 'Australian', canadian: 'Canadian', indian: 'Indian' };

// consonants only, so an id never reads as a word
const ID_LETTERS = 'bcdfghjklmnpqrstvwxz';
// a rewrite this much longer than its sentence carries a note of the model's
const MOST_GROWTH = 2;

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
	return `Rewrite the following ${written} text with spelling and grammar fixed and keep it as close to the tone of the original text. Each sentence starts with an id such as [zsc]. Keep every id and every $x$ as written. Answer with the text only. Do not think.`;
}

/** a sentence of a paragraph's reading, [from, to) */
export type SentenceAsked = { target: number; from: number; to: number; id: string };

export type RewriteRequest = { text: string; sentences: SentenceAsked[] };

/** `taken` are ids the text already holds, which would read as one of ours */
function idMaker(taken: Iterable<string>): () => string {
	const used = new Set(taken);
	return () => {
		for (;;) {
			let id = '';
			for (let i = 0; i < 3; i++) id += ID_LETTERS[Math.floor(Math.random() * ID_LETTERS.length)];
			if (!used.has(id)) {
				used.add(id);
				return id;
			}
		}
	};
}

export function sentencesOf(text: string, language: SpellLanguage): { from: number; to: number }[] {
	const out: { from: number; to: number }[] = [];
	for (const s of new Intl.Segmenter(language, { granularity: 'sentence' }).segment(text)) {
		const lead = s.segment.length - s.segment.trimStart().length;
		const body = s.segment.trim();
		if (body) out.push({ from: s.index + lead, to: s.index + lead + body.length });
	}
	return out;
}

export function rewriteRequest(targets: readonly ReviewTarget[]): RewriteRequest {
	const texts = targets.map((t) => t.reading().text);
	const nextId = idMaker(texts.flatMap((text) => [...text.matchAll(/\[([a-z]{3})\]/g)].map((mark) => mark[1])));
	const sentences: SentenceAsked[] = [];
	const paragraphs = targets.map((t, target) => {
		const text = texts[target];
		return sentencesOf(text, t.language)
			.map((s) => {
				const id = nextId();
				sentences.push({ target, ...s, id });
				return `[${id}] ${text.slice(s.from, s.to)}`;
			})
			.join(' ');
	});
	return { text: paragraphs.join('\n\n'), sentences };
}

/** each id's rewritten sentence; null when no id came back, which is an answer in some other form */
export function parseRewrite(answer: string, request: RewriteRequest): Map<string, string> | null {
	const asked = new Map(request.sentences.map((s) => [s.id, s]));
	const plain = answer.replace(/\*\*(\[[a-z]{3}\])\*\*/g, '$1');
	const marks = [...plain.matchAll(/\[([a-z]{3})\]/g)].filter((mark) => asked.has(mark[1]));
	if (!marks.length) return null;
	const out = new Map<string, string>();
	marks.forEach((mark, i) => {
		const end = marks[i + 1]?.index ?? plain.length;
		// a blank line ends a paragraph, and anything after the last one is the model talking
		const text = plain
			.slice(mark.index + mark[0].length, end)
			.split(/\n\s*\n/)[0]
			.replace(/\s+/g, ' ')
			.trim();
		const s = asked.get(mark[1])!;
		if (!out.has(mark[1]) && text.length <= (s.to - s.from) * MOST_GROWTH + 40) out.set(mark[1], text);
	});
	return out;
}
