// words of a textblock by Intl.Segmenter in the document's language; every inline leaf stands as U+FFFC, its own
// segment, so a formula, chip or citation counts as one word (T18)
import type { Node as PMNode } from 'prosemirror-model';

export const LEAF_CHARACTER = '\ufffc';

export type WordSegment = { readonly from: number; readonly to: number; readonly word: boolean };

const segmenters = new Map<string, Intl.Segmenter>();

function wordSegmenter(locale: string): Intl.Segmenter {
	let segmenter = segmenters.get(locale);
	if (!segmenter) segmenters.set(locale, (segmenter = new Intl.Segmenter(locale, { granularity: 'word' })));
	return segmenter;
}

/** a hyphenation language tag ('en-us', 'de-1996') as a locale Intl takes */
export function localeOf(language: string): string {
	const [base, region] = language.split('-');
	try {
		return Intl.getCanonicalLocales(region && /^[a-z]{2}$/i.test(region) ? `${base}-${region.toUpperCase()}` : base)[0];
	} catch {
		return 'en-US';
	}
}

/** the textblock's text with each inline leaf as one U+FFFC, so string offsets are content offsets */
export function textblockText(node: PMNode): string {
	let text = '';
	node.forEach((child) => {
		text += child.isText ? child.text! : LEAF_CHARACTER.repeat(child.nodeSize);
	});
	return text;
}

export function segmentWords(text: string, language = 'en-us'): WordSegment[] {
	const segments: WordSegment[] = [];
	for (const { segment, index, isWordLike } of wordSegmenter(localeOf(language)).segment(text)) {
		if (!segment.includes(LEAF_CHARACTER)) {
			segments.push({ from: index, to: index + segment.length, word: !!isWordLike });
			continue;
		}
		let start = index;
		for (let i = 0; i <= segment.length; i++) {
			if (i < segment.length && segment[i] !== LEAF_CHARACTER) continue;
			if (index + i > start) segments.push({ from: start, to: index + i, word: !!isWordLike });
			if (i < segment.length) segments.push({ from: index + i, to: index + i + 1, word: true });
			start = index + i + 1;
		}
	}
	return segments;
}
