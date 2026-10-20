export type { BiblatexReference } from './types';

export {
	parseBibtex,
	parseBibtexWithWarnings,
	parseSingleEntry,
	serializeBibtex,
	referencesToBib,
	findDuplicateKeys,
	isKeyUnique
} from './bibtexRoundtrip';
export type { ParseBibtexResult } from './bibtexRoundtrip';
export type { BibToken } from './bibtexParser';

// the generated-artifact side: keys and display fields scraped from a .bbl
export { parseBblEntries } from './bblScan';
export { parseHayagriva } from './hayagriva';

// schema validation is opt-in, used only by the visual add/edit form on save
export { schemaForType } from './schema';

export { fitsVisualEditor } from './fits';
export { OFFERED_ENTRY_TYPES } from '$lib/languages/latex/knowledge/registries/bibModel';

export { getEntryTypeConfigs, getFieldsForType, getEntryTypeOptions, type FieldConfig, type EntryTypeConfig } from './fieldConfig';

export { bibDisplayText, bibAuthorShort } from './bibDisplayText';

export { fieldsForType, validateEntry, type BibProblem } from './checks/bibValidate';
export { entryTypeAt } from './bibCompletion';
export { bibProblemText } from './checks/bibProblemText';
export { sameWorkAs, sameWorkIn, type SameWork } from './checks/bibSameWork';

// legacy field name -> the one biblatex renames it to (journal -> journaltitle)
export { BIB_FIELD_ALIASES, isVerbatimBibField } from '$lib/languages/latex/knowledge/registries/bibModel';
