// a footnote drawn as its mark: the number the language gives it (footnoteNumbers), with the note's text in the hint
import { tip } from '$lib/components/tooltip.svelte';
import type { ChipFace } from './chipFace';
import { footnoteNumbersOf } from './footnoteNumbers';

const HINT_LENGTH = 400;

/** `counted` is the footnote's place among the counted marks in its chip; null for a note that takes none (\footnotetext) */
export function footnoteFace(counted: number | null, given: string | null, note: string): ChipFace {
	const dom = document.createElement('sup');
	dom.className = 'drawn-footnote';
	// \footnotetext names no mark of its own unless given one
	dom.textContent = given ?? (counted === null ? '∗' : '');
	const hint = note.replace(/\s+/g, ' ').trim();
	const tipped = hint ? tip(dom, hint.length > HINT_LENGTH ? hint.slice(0, HINT_LENGTH) + '…' : hint) : null;
	return {
		dom,
		decorate(decorations) {
			if (counted === null || given !== null) return;
			const number = footnoteNumbersOf(decorations)[counted];
			dom.textContent = number === undefined ? '' : String(number);
		},
		destroy: () => tipped?.destroy()
	};
}
