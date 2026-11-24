// which line breaker a textblock takes (5.3, D9); a large document is held like any other (21.1)
import type { Node as PMNode } from 'prosemirror-model';
import type { LayoutStyle } from '../../contracts/styleTypes';

export type BreakProfile = {
	readonly breaker: 'knuthPlass' | 'greedy';
	readonly justified: boolean;
	/** hyphenation patterns may split words */
	readonly hyphenate: boolean;
};

export type BreakSettings = {
	/** the Justify setting */
	readonly justify: boolean;
	/** hyphenation is on and the document's language has patterns */
	readonly hyphenate: boolean;
};

// code is verbatim, and captions, notes and term titles belong to their float, table or list
const HELD_BLOCKS = new Set(['paragraph', 'heading']);
// text set some other way (centered, say) is broken ragged, never justified
const JUSTIFIABLE_ALIGNMENTS = new Set<LayoutStyle['textAlign']>(['start', 'left', 'justify']);
// a tab is as wide as the way to the next tab stop, which no item can say
const UNPLACEABLE = /[\t\r]/;

export function isHeldBlock(node: PMNode): boolean {
	return HELD_BLOCKS.has(node.type.name);
}

export function breakProfileOf(node: PMNode | null, style: LayoutStyle, settings: BreakSettings): BreakProfile {
	if (!node || !isHeldBlock(node)) return { breaker: 'greedy', justified: style.textAlign === 'justify', hyphenate: false };
	// a heading is set ragged, as titlesec and KOMA set it
	const justified = settings.justify && node.type.name === 'paragraph' && JUSTIFIABLE_ALIGNMENTS.has(style.textAlign);
	if (UNPLACEABLE.test(node.textContent)) return { breaker: 'greedy', justified, hyphenate: false };
	return { breaker: 'knuthPlass', justified, hyphenate: justified && settings.hyphenate };
}
