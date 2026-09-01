import { z } from 'zod';

const zName = z.union([z.string(), z.array(z.string())]);
const zStr = z.string().min(1);
const zMaybeStr = z.string().min(1).optional();
const zYear = z.string().min(1);
const zDate = z.string().min(1); // YYYY or YYYY-MM-DD

const commonOptionals = {
	subtitle: zMaybeStr,
	titleaddon: zMaybeStr,
	language: zMaybeStr,
	month: zMaybeStr,
	note: zMaybeStr,
	addendum: zMaybeStr,
	pubstate: zMaybeStr,
	doi: zMaybeStr,
	eprint: zMaybeStr,
	eprintclass: zMaybeStr,
	eprinttype: zMaybeStr,
	url: zMaybeStr,
	urldate: zMaybeStr
};

// the year/date XOR is enforced in BibEntrySchema's superRefine
const Base = z.object({
	key: zStr,
	entrytype: z.enum(['article', 'book', 'inbook', 'incollection', 'inproceedings', 'thesis', 'report', 'online', 'misc', 'dataset']),
	title: zStr,
	year: zYear.optional(),
	date: zDate.optional()
});

export const Article = Base.extend({
	entrytype: z.literal('article'),
	author: zName,
	journaltitle: zStr,
	translator: zMaybeStr,
	annotator: zMaybeStr,
	commentator: zMaybeStr,
	editor: zMaybeStr,
	editora: zMaybeStr,
	editorb: zMaybeStr,
	editorc: zMaybeStr,
	journalsubtitle: zMaybeStr,
	journaltitleaddon: zMaybeStr,
	issuetitle: zMaybeStr,
	issuesubtitle: zMaybeStr,
	issuetitleaddon: zMaybeStr,
	origlanguage: zMaybeStr,
	series: zMaybeStr,
	volume: zMaybeStr,
	number: zMaybeStr,
	eid: zMaybeStr,
	issue: zMaybeStr,
	pages: zMaybeStr,
	version: zMaybeStr,
	issn: zMaybeStr,
	...commonOptionals
});

export const Book = Base.extend({
	entrytype: z.literal('book'),
	author: zName,
	editor: zMaybeStr,
	editora: zMaybeStr,
	editorb: zMaybeStr,
	editorc: zMaybeStr,
	translator: zMaybeStr,
	annotator: zMaybeStr,
	commentator: zMaybeStr,
	introduction: zMaybeStr,
	foreword: zMaybeStr,
	afterword: zMaybeStr,
	maintitle: zMaybeStr,
	mainsubtitle: zMaybeStr,
	maintitleaddon: zMaybeStr,
	origlanguage: zMaybeStr,
	volume: zMaybeStr,
	part: zMaybeStr,
	edition: zMaybeStr,
	volumes: zMaybeStr,
	series: zMaybeStr,
	number: zMaybeStr,
	publisher: zMaybeStr,
	location: zMaybeStr,
	isbn: zMaybeStr,
	eid: zMaybeStr,
	chapter: zMaybeStr,
	pages: zMaybeStr,
	pagetotal: zMaybeStr,
	...commonOptionals
});

export const Inbook = Base.extend({
	entrytype: z.literal('inbook'),
	author: zName,
	booktitle: zStr,
	bookauthor: zMaybeStr,
	editor: zMaybeStr,
	editora: zMaybeStr,
	editorb: zMaybeStr,
	editorc: zMaybeStr,
	translator: zMaybeStr,
	annotator: zMaybeStr,
	commentator: zMaybeStr,
	introduction: zMaybeStr,
	foreword: zMaybeStr,
	afterword: zMaybeStr,
	maintitle: zMaybeStr,
	mainsubtitle: zMaybeStr,
	maintitleaddon: zMaybeStr,
	booksubtitle: zMaybeStr,
	booktitleaddon: zMaybeStr,
	origlanguage: zMaybeStr,
	volume: zMaybeStr,
	part: zMaybeStr,
	edition: zMaybeStr,
	volumes: zMaybeStr,
	series: zMaybeStr,
	number: zMaybeStr,
	publisher: zMaybeStr,
	location: zMaybeStr,
	isbn: zMaybeStr,
	eid: zMaybeStr,
	chapter: zMaybeStr,
	pages: zMaybeStr,
	...commonOptionals
});
export const Incollection = Base.extend({
	entrytype: z.literal('incollection'),
	author: zName,
	editor: zName,
	booktitle: zStr,
	editora: zMaybeStr,
	editorb: zMaybeStr,
	editorc: zMaybeStr,
	translator: zMaybeStr,
	annotator: zMaybeStr,
	commentator: zMaybeStr,
	introduction: zMaybeStr,
	foreword: zMaybeStr,
	afterword: zMaybeStr,
	maintitle: zMaybeStr,
	mainsubtitle: zMaybeStr,
	maintitleaddon: zMaybeStr,
	booksubtitle: zMaybeStr,
	booktitleaddon: zMaybeStr,
	origlanguage: zMaybeStr,
	volume: zMaybeStr,
	part: zMaybeStr,
	edition: zMaybeStr,
	volumes: zMaybeStr,
	series: zMaybeStr,
	number: zMaybeStr,
	publisher: zMaybeStr,
	location: zMaybeStr,
	isbn: zMaybeStr,
	eid: zMaybeStr,
	chapter: zMaybeStr,
	pages: zMaybeStr,
	...commonOptionals
});

export const Inproceedings = Base.extend({
	entrytype: z.literal('inproceedings'),
	author: zName,
	booktitle: zStr,
	editor: zMaybeStr,
	maintitle: zMaybeStr,
	mainsubtitle: zMaybeStr,
	maintitleaddon: zMaybeStr,
	booksubtitle: zMaybeStr,
	booktitleaddon: zMaybeStr,
	eventtitle: zMaybeStr,
	eventtitleaddon: zMaybeStr,
	eventdate: zMaybeStr,
	venue: zMaybeStr,
	volume: zMaybeStr,
	part: zMaybeStr,
	volumes: zMaybeStr,
	series: zMaybeStr,
	number: zMaybeStr,
	organization: zMaybeStr,
	publisher: zMaybeStr,
	location: zMaybeStr,
	isbn: zMaybeStr,
	eid: zMaybeStr,
	chapter: zMaybeStr,
	pages: zMaybeStr,
	...commonOptionals
});

export const Thesis = Base.extend({
	entrytype: z.literal('thesis'),
	author: zName,
	type: zStr,
	institution: zStr,
	location: zMaybeStr,
	isbn: zMaybeStr,
	eid: zMaybeStr,
	chapter: zMaybeStr,
	pages: zMaybeStr,
	pagetotal: zMaybeStr,
	...commonOptionals
});

export const Report = Base.extend({
	entrytype: z.literal('report'),
	author: zName,
	type: zStr,
	institution: zStr,
	number: zMaybeStr,
	version: zMaybeStr,
	location: zMaybeStr,
	isrn: zMaybeStr,
	eid: zMaybeStr,
	chapter: zMaybeStr,
	pages: zMaybeStr,
	pagetotal: zMaybeStr,
	...commonOptionals
});

export const Online = Base.extend({
	entrytype: z.literal('online'),
	// author OR editor, plus one of doi/eprint/url; enforced in superRefine
	author: zName.optional(),
	editor: zName.optional(),
	version: zMaybeStr,
	organization: zMaybeStr,
	...commonOptionals
});

export const Misc = Base.extend({
	entrytype: z.literal('misc'),
	author: zName.optional(),
	editor: zName.optional(),
	howpublished: zMaybeStr,
	type: zMaybeStr,
	version: zMaybeStr,
	organization: zMaybeStr,
	location: zMaybeStr,
	...commonOptionals
});

export const Dataset = Base.extend({
	entrytype: z.literal('dataset'),
	author: zName.optional(),
	editor: zName.optional(),
	edition: zMaybeStr,
	type: zMaybeStr,
	series: zMaybeStr,
	number: zMaybeStr,
	version: zMaybeStr,
	organization: zMaybeStr,
	publisher: zMaybeStr,
	location: zMaybeStr,
	...commonOptionals
});

// Passthrough, all of them: zod's output is what gets saved, so a field the form does not model -
// `journal`, a reference manager's `timestamp`, a @patent's `holder` - would be stripped out of the
// user's file on save. Keeping them is what lets these entries be edited in the form at all
// instead of being sent to the raw editor to protect them.
export const BibEntry = z.discriminatedUnion('entrytype', [
	Article.passthrough(),
	Book.passthrough(),
	Inbook.passthrough(),
	Incollection.passthrough(),
	Inproceedings.passthrough(),
	Thesis.passthrough(),
	Report.passthrough(),
	Online.passthrough(),
	Misc.passthrough(),
	Dataset.passthrough()
]);

export const BibEntrySchema = BibEntry.superRefine((v, ctx) => {
	// year and date are mutually exclusive, both may be absent
	if (v.year && v.date) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide year or date, not both.' });
	}

	if (v.entrytype === 'online') {
		if (!v.author && !v.editor) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Online: author or editor required.' });
		}
		if (!v.doi && !v.url && !v.eprint) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Online: must have doi, eprint, or url.' });
		}
	}
});

/**
 * The ten types above have hand-written rules. Every other biblatex type - @patent, @software,
 * @periodical - is checked only for the things any entry needs, so choosing one from the type
 * picker actually saves. biblatex's own mandatory-field rules are reported separately by
 * bibValidate, which knows all of them.
 */
export const GenericEntry = z
	.object({
		key: zStr,
		entrytype: zStr,
		title: zMaybeStr,
		year: zYear.optional(),
		date: zDate.optional()
	})
	.passthrough();

/** the rules for this entry's type: the strict ones where they exist, the shared ones otherwise */
export function schemaForType(entrytype: string | undefined) {
	return entrytype && entrytype in perTypeSchemas ? BibEntrySchema : GenericEntry;
}

// alias used by the BibManager form validation
export const biblatexReferenceSchema = BibEntrySchema;

// per-type map for the unknown-field check in fits.ts
export const perTypeSchemas = {
	article: Article,
	book: Book,
	inbook: Inbook,
	incollection: Incollection,
	inproceedings: Inproceedings,
	thesis: Thesis,
	report: Report,
	online: Online,
	// eslint-disable-next-line id-denylist -- @misc is a BibTeX entry type
	misc: Misc,
	dataset: Dataset
} as const;
