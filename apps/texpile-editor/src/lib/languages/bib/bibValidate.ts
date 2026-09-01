import { BIB_ENTRY_TYPES, BIB_FIELDS, BIB_FIELDS_BY_TYPE, BIB_FIELD_ALIASES, BIB_MANDATORY, BIB_UNIVERSAL_FIELDS } from './bibDatamodel';

/**
 * What biber will say about an entry, said before the compile.
 *
 * Every rule here is biblatex's own, read out of its data model rather than decided by us, so a
 * warning shown in the editor is one the build would have produced. The costly one to get wrong is
 * `journal`: biblatex renames it to `journaltitle` on input, so it is a legacy spelling and NOT a
 * missing field, and an entry using it is complete.
 */
export type BibProblem =
	| { kind: 'unknown-type'; entryType: string }
	| { kind: 'legacy-field'; field: string; prefer: string }
	/** a name one letter away from a field this entry lacks and nothing else supplies */
	| { kind: 'misspelled-field'; field: string; suggest: string }
	| { kind: 'field-not-for-type'; field: string; entryType: string }
	| { kind: 'missing'; fields: string[] }
	| { kind: 'missing-one-of'; fields: string[] }
	| { kind: 'mutually-exclusive'; fields: string[] };

/** the app's own bookkeeping, never part of the entry's data */
const INTERNAL = new Set(['key', 'entrytype', 'raw', 'displayLabel', 'hasInlineComment']);

const KNOWN_TYPES = new Set(BIB_ENTRY_TYPES);
const UNIVERSAL = new Set(BIB_UNIVERSAL_FIELDS);

/** what biber sees after biblatex has renamed the legacy spellings */
function resolved(fields: Iterable<string>): Set<string> {
	const out = new Set<string>();
	for (const f of fields) out.add(BIB_FIELD_ALIASES[f] ?? f);
	return out;
}

/** every field name this entry type accepts, its own and the universal ones */
export function fieldsForType(entryType: string): string[] {
	return [...new Set([...(BIB_FIELDS_BY_TYPE[entryType] ?? []), ...BIB_UNIVERSAL_FIELDS])].sort();
}

/** one edit apart, transposition included: the distance a typed field name is usually wrong by */
function oneEditApart(a: string, b: string): boolean {
	if (a === b) return false;
	if (Math.abs(a.length - b.length) > 1) return false;
	let i = 0;
	let j = 0;
	let edits = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			i++;
			j++;
			continue;
		}
		if (++edits > 1) return false;
		if (a[i + 1] === b[j] && a[i] === b[j + 1]) {
			i += 2;
			j += 2; // transposed
		} else if (a.length > b.length) i++;
		else if (a.length < b.length) j++;
		else {
			i++;
			j++;
		}
	}
	return edits + (a.length - i) + (b.length - j) <= 1;
}

/** a field is already accounted for if it is present, or if something in its either-or group is */
function accountedFor(entryType: string, field: string, present: Set<string>): boolean {
	if (present.has(field)) return true;
	for (const rule of BIB_MANDATORY[entryType] ?? []) {
		const group = rule.xor ?? rule.or;
		if (group?.includes(field) && group.some((f) => present.has(f))) return true;
	}
	return false;
}

/**
 * @param entryType the `@type` as written
 * @param fieldNames the entry's field names as written; the app's internal keys are ignored
 */
export function validateEntry(entryType: string, fieldNames: Iterable<string>): BibProblem[] {
	const problems: BibProblem[] = [];
	const type = entryType.toLowerCase();
	const written = [...fieldNames].map((f) => f.toLowerCase()).filter((f) => !INTERNAL.has(f));

	if (!KNOWN_TYPES.has(type)) problems.push({ kind: 'unknown-type', entryType });

	// what biber will see once the legacy spellings are renamed
	const present = resolved(written);
	const forType = new Set(BIB_FIELDS_BY_TYPE[type] ?? []);
	for (const field of written) {
		const prefer = BIB_FIELD_ALIASES[field];
		if (prefer) {
			problems.push({ kind: 'legacy-field', field, prefer });
			continue;
		}
		if (!(field in BIB_FIELDS)) {
			// Silence by default: biber ignores what it does not know, and reference managers stamp
			// their own fields on every entry they export - DBLP alone adds timestamp, biburl and
			// bibsource. Warning about those would train the eye to skip the warnings that matter.
			// A name one letter from a field the entry is missing is a different thing: that one
			// cost the author the field they meant to write.
			const near = fieldsForType(type).find((f) => oneEditApart(field, f) && !accountedFor(type, f, present));
			if (near) problems.push({ kind: 'misspelled-field', field, suggest: near });
			continue;
		}
		// a field biblatex knows, in an entry type that does not take it: biber drops it silently
		if (KNOWN_TYPES.has(type) && !forType.has(field) && !UNIVERSAL.has(field)) {
			problems.push({ kind: 'field-not-for-type', field, entryType: type });
		}
	}

	for (const rule of BIB_MANDATORY[type] ?? []) {
		if (rule.all) {
			const missing = rule.all.filter((f) => !present.has(f));
			if (missing.length) problems.push({ kind: 'missing', fields: missing });
		}
		if (rule.or && !rule.or.some((f) => present.has(f))) problems.push({ kind: 'missing-one-of', fields: [...rule.or] });
		if (rule.xor) {
			const have = rule.xor.filter((f) => present.has(f));
			if (have.length === 0) problems.push({ kind: 'missing-one-of', fields: [...rule.xor] });
			if (have.length > 1) problems.push({ kind: 'mutually-exclusive', fields: have });
		}
	}

	return problems;
}
