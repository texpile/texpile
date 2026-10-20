import { z } from 'zod';
import { m } from '$lib/paraglide/messages';
import { BIB_FIELD_ALIASES } from '$lib/languages/latex/knowledge/registries/bibModel';
import { mandatoryProblems, type BibProblem } from './checks/bibValidate';
import { getEntryTypeConfigs, getFieldsForType } from './fieldConfig';

// Passthrough: zod's output is what gets saved, so a field the form does not model - `journal`, a
// reference manager's `timestamp`, a @patent's `holder` - would be stripped out of the user's file
// on save. Keeping them is what lets these entries be edited in the form at all instead of being
// sent to the raw editor to protect them.
const Entry = z.object({ key: z.string().min(1), entrytype: z.string().min(1) }).passthrough();

function holdsValue(value: unknown): boolean {
	return Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.trim().length > 0;
}

function messageOf(problem: BibProblem): string {
	if (problem.kind === 'missing-one-of') return m.bib_warn_missing_one_of({ fields: problem.fields.join(', ') });
	if (problem.kind === 'mutually-exclusive') return m.bib_warn_conflict({ fields: problem.fields.join(', ') });
	return m.bib_error_required_field();
}

/** the rules for this entry's type: biblatex's mandatory fields for a type the form offers fields for, the shared ones otherwise */
export function schemaForType(entrytype: string | undefined) {
	return Entry.superRefine((entry, ctx) => {
		if (!entrytype || !(entrytype in getEntryTypeConfigs())) return;
		const shown = new Set(getFieldsForType(entrytype).map((f) => f.name));
		const present = new Set(
			Object.entries(entry)
				.filter(([, value]) => holdsValue(value))
				.map(([name]) => BIB_FIELD_ALIASES[name] ?? name)
		);
		for (const problem of mandatoryProblems(entrytype, present)) {
			if (!('fields' in problem)) continue;
			// a missing field reports under its own input, a group under the first of its inputs, a field with none under the form
			const groups = problem.kind === 'missing' ? problem.fields.map((f) => [f]) : [problem.fields];
			for (const group of groups) {
				const field = group.find((f) => shown.has(f));
				ctx.addIssue({ code: z.ZodIssueCode.custom, message: messageOf(problem), path: field ? [field] : [] });
			}
		}
	});
}
