import type { LintMatch } from '../linter';
import type { SpellLanguage } from '../languages/spellLanguages';

/** what the model was sent for a paragraph: the text, with formulas as `$x$`, and where a span of it is in the text Harper read */
export type ReviewReading = { text: string; toLinted(offset: number, length: number): { offset: number; length: number } };

/** one paragraph as an editor checked it: the text the checker read and what it found there */
export type ReviewTarget = { language: SpellLanguage; linted: string; matches: LintMatch[]; reading(): ReviewReading };

export type HarperVerdict = { verdict: 'keep' | 'drop' | 'replace' | 'term'; replacement: string };

export type OwnFinding = { quote: string; replacement: string; kind: 'grammar' | 'wording'; reason: string };

/** the model's answer for one paragraph; a Harper finding it gave no verdict on is kept */
export type ParagraphReview = { verdicts: Map<number, HarperVerdict>; own: OwnFinding[] };
