import { m } from '$lib/paraglide/messages';
import type { BibProblem } from './bibValidate';

/** a problem as one line of prose, in the reader's language */
export function bibProblemText(problem: BibProblem): string {
	switch (problem.kind) {
		case 'unknown-type':
			return m.bib_warn_unknown_type({ entryType: `@${problem.entryType}` });
		case 'legacy-field':
			return m.bib_warn_legacy_field({ field: problem.field, prefer: problem.prefer });
		case 'misspelled-field':
			return m.bib_warn_misspelled({ field: problem.field, suggest: problem.suggest });
		case 'field-not-for-type':
			return m.bib_warn_field_not_for_type({ field: problem.field, entryType: `@${problem.entryType}` });
		case 'missing':
			return m.bib_warn_missing({ fields: problem.fields.join(', ') });
		case 'missing-one-of':
			return m.bib_warn_missing_one_of({ fields: problem.fields.join(', ') });
		case 'mutually-exclusive':
			return m.bib_warn_conflict({ fields: problem.fields.join(', ') });
	}
}
