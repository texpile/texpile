// Harper's findings by paragraph text, shared by the source editors and the Problems tab
import { onLintRulesChanged, type LintMatch } from '../linter';
import { proofreadIn } from '../languages/proofreadIn';
import type { SpellLanguage } from '../languages/spellLanguages';
import type { Paragraph, SpellMarkup } from './sourceProse';

const MOST_KEPT = 20_000;
// joined into worker calls of at most this many chars, so a first check of a long file runs in slices
const CHUNK_CHARS = 20_000;

const found = new Map<string, LintMatch[]>();

onLintRulesChanged(() => found.clear());

function keyOf(spelling: SpellLanguage | null, markup: SpellMarkup, text: string): string {
	return `${spelling}|${markup === 'typst' ? 'typst' : 'plaintext'}|${text}`;
}

/** offsets from the paragraph's start; undefined until it is checked */
export function paragraphLints(spelling: SpellLanguage | null, markup: SpellMarkup, text: string): LintMatch[] | undefined {
	return found.get(keyOf(spelling, markup, text));
}

/** checks the paragraphs not checked yet; false when Harper failed or `isStale` said stop */
export async function lintParagraphs(
	paras: readonly Paragraph[],
	spelling: SpellLanguage | null,
	markup: SpellMarkup,
	isStale: () => boolean
): Promise<boolean> {
	const queued = new Set<string>();
	const stale = paras.filter((p) => !found.has(keyOf(spelling, markup, p.text)) && !queued.has(p.text) && !!queued.add(p.text));
	for (let i = 0; i < stale.length;) {
		const batch: Paragraph[] = [];
		let size = 0;
		do {
			size += stale[i].text.length + 2;
			batch.push(stale[i++]);
		} while (i < stale.length && size + stale[i].text.length + 2 <= CHUNK_CHARS);
		const res = await proofreadIn(spelling, batch.map((p) => p.text).join('\n\n'), {
			markup: markup === 'typst' ? 'typst' : 'plaintext',
			isStale
		});
		// a failure is never kept as clean, or those paragraphs would never be checked again
		if (isStale() || res.failed) return false;
		let base = 0;
		for (const p of batch) {
			const end = base + p.text.length;
			const rel = res.matches
				.filter((m) => m.offset >= base && m.offset + m.length <= end)
				.map((m) => ({ ...m, offset: m.offset - base }))
				.sort((a, b) => a.offset - b.offset || a.length - b.length);
			const key = keyOf(spelling, markup, p.text);
			found.delete(key);
			found.set(key, rel);
			if (found.size > MOST_KEPT) found.delete(found.keys().next().value!);
			base = end + 2;
		}
	}
	return true;
}
