// The visual editor's paragraphs for the review: the blocks on screen, read as Harper reads them
import type { Node as PmNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import type { Plugin } from 'prosemirror-state';
import type { LintMatch } from '../linter';
import type { SpellLanguage } from '../languages/spellLanguages';
import { blockSpellText, harperReading } from '../blockSpellText';
import type { ReviewSource } from './reviewQueue';
import type { ReviewTarget } from './reviewTypes';

const MOST_KEPT = 3000;
// the checker's findings by the text it read, in that text's offsets, kept from each lint for the review to send
const found = new Map<string, LintMatch[]>();

export function noteFindings(language: SpellLanguage, linted: string, matches: LintMatch[]): void {
	const key = `${language}|${linted}`;
	found.delete(key);
	found.set(key, matches);
	if (found.size > MOST_KEPT) found.delete(found.keys().next().value!);
}

/** Harper reads a block as the model is sent it, so the reading maps one to one; a dictionary reads the block's own
 *  text, one character per position, and the model gets Harper's reading of it */
export function pmTarget(language: SpellLanguage, linted: string, matches: LintMatch[]): ReviewTarget {
	const reading =
		language === 'en'
			? () => ({ text: linted, toLinted: (offset: number, length: number) => ({ offset, length }) })
			: () => {
					const read = harperReading(linted);
					return { text: read.text, toLinted: read.blockSpan };
				};
	return { language, linted, matches, reading };
}

/** the text a block's check read, as lintTextAfterComposition gives it */
function lintedOf(node: PmNode, language: SpellLanguage): string {
	const block = blockSpellText(node);
	return language === 'en' ? harperReading(block).text : block;
}

/** a block the proofreader checks: one with no blocks inside */
function checked(node: PmNode): boolean {
	if (!node.isBlock) return false;
	let nested = false;
	node.forEach((child) => (nested ||= child.isBlock));
	return !nested;
}

function blocksOnScreen(view: EditorView): PmNode[] {
	const box = view.dom.getBoundingClientRect();
	const win = view.dom.ownerDocument.defaultView ?? window;
	const top = Math.max(box.top, 0);
	const bottom = Math.min(box.bottom, win.innerHeight);
	if (bottom <= top || box.width === 0) return [];
	const left = box.left + box.width / 2;
	const from = view.posAtCoords({ left, top: top + 1 })?.pos ?? 0;
	const to = view.posAtCoords({ left, top: bottom - 1 })?.pos ?? view.state.doc.content.size;
	const out: PmNode[] = [];
	view.state.doc.nodesBetween(from, to, (node) => {
		if (!checked(node)) return true;
		if (node.textContent.length > 1) out.push(node);
		return false;
	});
	return out;
}

type ProofreadCache = { cacheMap: Map<string, { text: string }> };

export function pmReviewSource(view: EditorView, proofread: Plugin, language: () => SpellLanguage | null): ReviewSource {
	return {
		visible() {
			const lang = language();
			if (!lang || view.isDestroyed) return [];
			return blocksOnScreen(view).flatMap((node) => {
				const linted = lintedOf(node, lang);
				const matches = found.get(`${lang}|${linted}`);
				return matches ? [pmTarget(lang, linted, matches)] : [];
			});
		},
		redraw(linted) {
			const lang = language();
			if (!lang || view.isDestroyed) return;
			const shown = new Set(
				blocksOnScreen(view)
					.filter((node) => linted.has(lintedOf(node, lang)))
					.map((n) => n.textContent)
			);
			const cache = (proofread.getState(view.state) as ProofreadCache | undefined)?.cacheMap;
			if (!cache || !shown.size) return;
			// prosemirror-proofread keys its cache by a hash of the block's text and keeps the text beside it
			for (const [key, entry] of cache) if (shown.has(entry.text)) cache.delete(key);
			view.dispatch(view.state.tr.setMeta('forceProofread', true));
		}
	};
}
