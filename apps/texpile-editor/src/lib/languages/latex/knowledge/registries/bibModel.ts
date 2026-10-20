// biblatex's data model: the entry types, what each must carry, the fields and what each holds, and the legacy BibTeX
// names biblatex reads as others
import { commonRegistry } from './registries';

/** a field holds one value, or a list of them (authors, locations) */
export type BibFieldKind = 'field' | 'list';

export type BibFieldSpec = { kind: BibFieldKind; datatype: string };

/** one mandatory-field rule: all of them, exactly one of them, or at least one of them */
export type BibConstraint = { all?: string[]; xor?: string[]; or?: string[] };

const types = commonRegistry('bibTypes').filter((t) => t.file === 'packages/biblatex');
const fields = commonRegistry('bibFields').filter((f) => f.file === 'packages/biblatex');

/** every entry type biblatex defines, `customa`-`customf` and the machinery types included */
export const BIB_ENTRY_TYPES: readonly string[] = types.filter((t) => !t.alias).map((t) => t.name);

/** the entry types worth offering: not xdata, which biblatex leaves out of the output, nor the hidden ones (set, customa to customf) */
export const OFFERED_ENTRY_TYPES: readonly string[] = types.filter((t) => !t.alias && !t.hidden && !t.skipout).map((t) => t.name);

/** what each field name holds */
export const BIB_FIELDS: Readonly<Record<string, BibFieldSpec>> = Object.fromEntries(
	fields.filter((f) => !f.alias).map((f) => [f.name, { kind: f.kind ?? 'field', datatype: f.datatype ?? 'literal' }])
);

/** accepted by every entry type */
export const BIB_UNIVERSAL_FIELDS: readonly string[] = fields.filter((f) => !f.alias && !f.types).map((f) => f.name);

/** every type biblatex reads, the BibTeX ones it reads as others included */
export const BIB_READ_TYPES: readonly string[] = types.map((t) => t.name);

/** accepted by that entry type on top of the universal ones */
export const BIB_FIELDS_BY_TYPE: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
	types.map((t) => [t.name, fields.filter((f) => f.types?.includes(t.alias ?? t.name)).map((f) => f.name)])
);

/** what an entry of that type must carry, as biber will check it */
export const BIB_MANDATORY: Readonly<Record<string, readonly BibConstraint[]>> = Object.fromEntries(
	types.filter((t) => t.required).map((t) => [t.name, t.required!])
);

/** legacy BibTeX field names biblatex renames on input: `journal` is `journaltitle` */
export const BIB_FIELD_ALIASES: Readonly<Record<string, string>> = Object.fromEntries(
	fields.filter((f) => f.alias).map((f) => [f.name, f.alias!])
);

/** BibTeX entry types biblatex reads as others: `@phdthesis` is a thesis */
export const BIB_TYPE_ALIASES: Readonly<Record<string, string>> = Object.fromEntries(
	types.filter((t) => t.alias).map((t) => [t.name, t.alias!])
);

/** a field whose value LaTeX reads verbatim, so escaping it would corrupt it (doi, url, eprint) */
export function isVerbatimBibField(name: string): boolean {
	const datatype = BIB_FIELDS[BIB_FIELD_ALIASES[name] ?? name]?.datatype;
	return datatype === 'verbatim' || datatype === 'uri';
}

/** the fields that name other entries by key (crossref, xdata, related) */
export const BIB_ENTRYKEY_FIELDS: readonly string[] = fields.filter((f) => !f.alias && f.datatype === 'entrykey').map((f) => f.name);
