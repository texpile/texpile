import type { LintMatch } from '../linter';
import type { SpellLanguage } from '../languages/spellLanguages';
import type { ChangeKind } from './rewrite/changeTitles';

/** what the model was sent for a paragraph: the text, with formulas as `$x$`, and where a span of it is in the text Harper read */
export type ReviewReading = { text: string; toLinted(offset: number, length: number): { offset: number; length: number } };

/** one paragraph as an editor checked it: the text the checker read and what it found there */
export type ReviewTarget = { language: SpellLanguage; linted: string; matches: LintMatch[]; reading(): ReviewReading };

/** drop: the model left the words as they were, or changed them in a change of its own; term: a spelling it kept */
export type HarperVerdict = { verdict: 'drop' | 'term' };

/** a change the model made: `at` in the reading, `reason` the message of Harper's finding on the same words */
export type OwnFinding = {
	quote: string;
	replacement: string;
	at: number;
	kind: 'grammar' | 'wording';
	change: ChangeKind;
	reason: string;
};

/** the model's answer for one paragraph; a Harper finding with no verdict, in a sentence that did not come back, is kept */
export type ParagraphReview = { verdicts: Map<number, HarperVerdict>; own: OwnFinding[] };
