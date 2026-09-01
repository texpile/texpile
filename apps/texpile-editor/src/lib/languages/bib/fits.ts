// decides whether an entry can render and round-trip in BibManager's visual form;
// anything that can't gets demoted to a raw CodeMirror row so no data is silently lost
import type { BiblatexReference } from './types';
import { BIB_ENTRY_TYPES } from './bibDatamodel';

const KNOWN_TYPES = new Set(BIB_ENTRY_TYPES);

/**
 * Whether the form can HOLD the entry, which is not the same question as whether the entry is
 * correct. It used to be: an entry missing its author failed the schema and was sent to the raw
 * editor, so the one kind of entry most in need of a form was the one kind that never got one.
 * Being incomplete is now reported in the form instead, next to the fields that would fix it.
 *
 * Fields the form does not model no longer force a demotion either, because the schemas pass them
 * through on save rather than dropping them. What is left is what the form genuinely cannot
 * represent.
 */
export function fitsVisualEditor(ref: BiblatexReference): boolean {
	// a % comment inside the entry body: regenerating from fields would lose it
	if (ref.hasInlineComment) return false;

	// a type biblatex does not define has no meaningful field list to offer, and is usually a typo
	// worth seeing as source
	return KNOWN_TYPES.has(ref.entrytype);
}
