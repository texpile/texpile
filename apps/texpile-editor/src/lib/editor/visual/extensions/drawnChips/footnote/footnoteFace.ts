// a footnote drawn as its mark: the number the language gives it (footnoteNumbers), with the note's text in the hint
import type { ChipFace } from '../chipFace';
import { chipElement } from '../looks/chipLooks';
import { footnoteNumbersOf } from './footnoteNumbers';

const HINT_LENGTH = 400;

/** `counted` is the footnote's place among the counted marks in its chip; null for a note that takes none (\footnotetext) */
export function footnoteFace(counted: number | null, given: string | null, note: string): ChipFace {
	const dom = chipElement('sup', 'drawn-footnote');
	// \footnotetext names no mark of its own unless given one
	dom.textContent = given ?? (counted === null ? '∗' : '');
	const hint = note.replace(/\s+/g, ' ').trim();
	if (hint) dom.hint = hint.length > HINT_LENGTH ? hint.slice(0, HINT_LENGTH) + '…' : hint;
	return {
		dom,
		decorate(decorations) {
			if (counted === null || given !== null) return;
			// a footnote the editor is not sure how to number
			const mark = footnoteNumbersOf(decorations)[counted] || '∗';
			if (dom.textContent !== mark) dom.textContent = mark;
		}
	};
}
