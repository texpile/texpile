// Turns the BibTeX doi.org hands back into an entry worth keeping, and finds a work the project
// already cites. Text in, text out: the lookup itself is the caller's.
//
// The registries' BibTeX compiles, but it is not what a person would write. Crossref keys are
// Surname_Year, which collide on the second paper by the same author that year, and DataCite
// keys are the whole DOI link, which nobody wants to type into a \cite. Titles arrive with HTML markup and
// bare ampersands, pages with a Unicode dash, and a doi.org url beside the doi field, which
// author-year styles then print twice. Each of those is fixed here, and nothing else is
// rewritten.
import {
	BIB_FIELD_ALIASES,
	bibAuthorShort,
	bibDisplayText,
	parseBibtex,
	referencesToBib,
	validateEntry,
	type BiblatexReference
} from '$lib/languages/bib/biblatex';
import { isbn13, type WorkId } from './doiInput';

/**
 * What reads the project's bibliography: classic BibTeX, biblatex through biber, or Typst, whose
 * bib reader takes biblatex's field names and TeX's accents and escapes but prints a formatting
 * command such as \textit{...} as it stands
 */
export type BibDialect = 'bibtex' | 'biblatex' | 'typst';

export type Work = {
	/** the cite key, unique among `taken` */
	key: string;
	/** the entry as it goes into the .bib */
	bib: string;
	/** what the preview shows */
	title: string;
	authors: string;
	venue: string;
	year: string;
};

const INTERNAL = new Set(['key', 'entrytype', 'raw', 'displayLabel', 'hasInlineComment']);
// registry bookkeeping no citation style prints: month arrives as a bare macro (apr) that a
// braced rewrite would print literally, and keywords/copyright are DataCite's subject tags and licence
const DROPPED = new Set(['issn', 'month', 'keywords', 'copyright', 'abstract']);
// the fields a reader scans for first, in the order people write them; the rest keep theirs
const LEADING = [
	'author',
	'editor',
	'title',
	'journal',
	'journaltitle',
	'booktitle',
	'howpublished',
	'volume',
	'number',
	'pages',
	'year',
	'date',
	'publisher'
];
const TRAILING = ['doi', 'url', 'eprint', 'archiveprefix', 'eprinttype'];
// fields that hold identifiers or links, which LaTeX reads verbatim and escaping would corrupt
const VERBATIM = new Set(['doi', 'url', 'eprint', 'isbn', 'issn', 'archiveprefix', 'eprinttype', 'primaryclass', 'eprintclass']);

/**
 * The work in `fetched` as the project would keep it, or null when there is no entry in it.
 * `taken` holds the project's keys; the new key avoids them.
 */
export function workFromBibtex(fetched: string, id: WorkId, dialect: BibDialect, taken: Iterable<string>): Work | null {
	const got = parseBibtex(fetched)[0];
	if (!got) return null;

	const fields: Record<string, string> = {};
	for (const [name, value] of Object.entries(got)) {
		if (INTERNAL.has(name) || DROPPED.has(name) || typeof value !== 'string' || !value.trim()) continue;
		fields[name] = value.trim();
	}

	// DOIs ignore case, and Crossref lower-cases them (10.1109/cvpr.2016.90): keep the spelling pasted
	if (fields.doi) {
		const pasted = 'doi' in id ? id.doi : '';
		fields.doi = bareDoi(fields.doi).toLowerCase() === pasted.toLowerCase() ? pasted : bareDoi(fields.doi);
	}
	if (id.kind === 'isbn') fields.isbn = id.isbn;
	// biblatex prints a PubMed ID from these two fields; BibTeX's styles and Typst have no place for one
	if (id.kind === 'pmid' && dialect !== 'biblatex') {
		delete fields.eprint;
		delete fields.eprinttype;
	}
	let entrytype = got.entrytype;
	if (id.kind === 'arxiv') {
		// DataCite prints the prefix upper-cased; this is how arXiv itself writes it
		fields.doi = id.doi;
		fields.eprint = id.id;
		fields.archiveprefix = 'arXiv';
		fields.url ??= `https://arxiv.org/abs/${id.id}`;
		// DataCite types some old-style papers @article, with no journal to go with it
		if (!fields.journal && !fields.journaltitle) entrytype = 'misc';
	}
	for (const name of ['author', 'editor']) if (fields[name]) fields[name] = nameList(fields[name]);
	if (fields.url && /^https?:\/\/(?:dx\.)?doi\.org\//i.test(fields.url)) delete fields.url;
	if (fields.pages) fields.pages = fields.pages.replace(/\s*[-\u2010-\u2015]+\s*/g, '--');
	// a title with braces was protected by whoever wrote it; only a bare one gets them added
	const protect = !!fields.title && !/[{}]/.test(fields.title);
	for (const [name, value] of Object.entries(fields)) if (!VERBATIM.has(name)) fields[name] = texText(value, dialect !== 'typst');
	if (protect) fields.title = protectCapitals(fields.title);

	if (dialect !== 'bibtex') {
		for (const [legacy, modern] of Object.entries(BIB_FIELD_ALIASES)) {
			if (legacy in fields && !(modern in fields)) fields[modern] = fields[legacy];
			delete fields[legacy];
		}
	} else {
		// classic styles print no eprint field; this is the line they do print for a preprint
		if (id.kind === 'arxiv') fields.howpublished ??= `arXiv preprint arXiv:${id.id}`;
		// Crossref's chapter-with-a-booktitle: classic @inbook takes its title as the book's and
		// drops the booktitle, where @incollection prints both
		if (entrytype === 'inbook' && fields.booktitle) entrytype = 'incollection';
	}
	// what the type never prints, such as a publisher on an article: the bib editor would flag
	// every new entry for it, and BibTeX's standard styles skip the same fields
	for (const p of validateEntry(entrytype, Object.keys(fields))) if (p.kind === 'field-not-for-type') delete fields[p.field];

	const key = uniqueKey(baseKey(fields), taken);
	const ordered: BiblatexReference = { key, entrytype };
	for (const name of LEADING) if (name in fields) ordered[name] = fields[name];
	for (const name of Object.keys(fields)) if (!LEADING.includes(name) && !TRAILING.includes(name)) ordered[name] = fields[name];
	for (const name of TRAILING) if (name in fields) ordered[name] = fields[name];

	return {
		key,
		bib: referencesToBib([ordered]).trim(),
		...preview(ordered)
	};
}

/** the preview line for an entry already in the project, or a fetched one */
export function preview(ref: BiblatexReference): Pick<Work, 'title' | 'authors' | 'venue' | 'year'> {
	const venue = ref.journaltitle ?? ref.journal ?? ref.booktitle ?? ref.publisher ?? (ref.eprint ? `arXiv:${ref.eprint}` : '');
	return {
		title: plain(ref.title ?? ''),
		authors: bibAuthorShort(ref.author ?? ref.editor),
		venue: plain(typeof venue === 'string' ? venue : ''),
		year: ref.year ?? (ref.date ?? '').slice(0, 4)
	};
}

/** the project's entry for the same work, by DOI, arXiv eprint, ISBN or PubMed ID */
export function findCited(refs: readonly BiblatexReference[], id: WorkId): BiblatexReference | null {
	if (id.kind === 'isbn') return refs.find((ref) => typeof ref.isbn === 'string' && isbn13(ref.isbn) === id.isbn) ?? null;
	if (id.kind === 'pmid') return refs.find((ref) => pubmedId(ref) === id.pmid) ?? null;
	const want = id.doi.toLowerCase();
	for (const ref of refs) {
		if (typeof ref.doi === 'string' && bareDoi(ref.doi).toLowerCase() === want) return ref;
		if (id.kind !== 'arxiv') continue;
		const eprint = typeof ref.eprint === 'string' ? ref.eprint.replace(/^arxiv:\s*/i, '').replace(/v\d+$/, '') : '';
		if (eprint === id.id) return ref;
		if (typeof ref.url === 'string' && new RegExp(`arxiv\\.org/(?:abs|pdf)/${escapeRe(id.id)}(?:v\\d+)?(?:\\.pdf)?$`, 'i').test(ref.url))
			return ref;
	}
	return null;
}

function pubmedId(ref: BiblatexReference): string {
	if (typeof ref.pmid === 'string') return ref.pmid.trim();
	return typeof ref.eprint === 'string' && /^pubmed$/i.test(String(ref.eprinttype ?? '')) ? ref.eprint.trim() : '';
}

function bareDoi(doi: string): string {
	return doi.trim().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, '');
}

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A registry's name list as BibTeX reads it. Crossref ends a list whose last member is an
 * organisation it could not name with an empty "and" (an empty name to BibTeX), and some old
 * records are in capitals throughout (WATSON, J. D.). DataCite writes an organisation as a family
 * name with an empty given name ("The pandas development team, "), which unbraced BibTeX would
 * read as a person called "team".
 */
function nameList(value: string): string {
	const letters = value.replace(/\sand\s/g, ' ');
	const shouting = /[A-Z]{2}/.test(letters) && !/[a-z]/.test(letters);
	const names: string[] = [];
	let pending: string[] = [];
	for (const n of value.split(/\s+and(?:\s+|$)/).map((part) => part.trim())) {
		if (!n) continue;
		// an organisation's own "and" splits it (Food and Agriculture Organization, ), where DataCite
		// writes every person Family, Given
		if (/^[^,]*,$/.test(n)) names.push([...pending, n].join(' and '));
		else if (n.includes(',')) names.push(...pending, n);
		else {
			pending.push(n);
			continue;
		}
		pending = [];
	}
	return [...names, ...pending]
		.map((n) => {
			if (/,$/.test(n)) {
				const org = n.replace(/,+$/, '').trim();
				return /^\{.*\}$/.test(org) ? org : `{${org}}`;
			}
			// capitals on every letter: each word as a name is written, O'BRIEN to O'Brien
			return shouting && !/^\{/.test(n)
				? n.toLowerCase().replace(/(^|[\s\-'’.])(\p{L})/gu, (_, b: string, c: string) => b + c.toUpperCase())
				: n;
		})
		.join(' and ');
}

const TAGS: Record<string, string> = {
	i: 'textit',
	em: 'emph',
	b: 'textbf',
	strong: 'textbf',
	sub: 'textsubscript',
	sup: 'textsuperscript',
	scp: 'textsc'
};
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/**
 * A registry's field value as LaTeX text: entities decoded, specials escaped, and HTML markup made
 * formatting commands - or, without `commands`, dropped with its text kept
 */
function texText(value: string, commands: boolean): string {
	let s = value;
	// innermost first, so <i>a <b>b</b></i> nests; tags this does not know go, their text stays
	for (let prev = ''; prev !== s;) {
		prev = s;
		s = s.replace(/<(\w+)(?:\s[^>]*)?>([^<]*)<\/\1>/g, (_, tag: string, inner: string) => {
			const cmd = TAGS[tag.toLowerCase()];
			return cmd && commands ? `\\${cmd}{${inner}}` : inner;
		});
	}
	s = s.replace(/<\/?[\w:-]+(?:\s[^>]*)?\/?>/g, '');
	// Crossref pretty-prints the XML around a tag, and the line break it leaves before a colon
	// would print as a space
	s = s.replace(/\s*\n\s*([:;,.?!)])/g, '$1');
	s = s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
		if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
		return ENTITIES[e.toLowerCase()] ?? m;
	});
	// characters LaTeX reads as syntax; an underscore stays bare inside math the registry wrote
	s = s.replace(/(?<!\\)([&%#])/g, '\\$1');
	if (!s.includes('$')) s = s.replace(/(?<!\\)_/g, '\\_');
	return s.replace(/\s+/g, ' ').trim();
}

/**
 * Braces around the words a style must not lower-case: BERT, iPhone, COVID-19. BibTeX styles
 * that set titles in sentence case lower-case everything unbraced, which turns an acronym into
 * a word. A capital that only starts a word (or a part of a hyphenated one) is title case, and
 * stays free to be lowered.
 */
function protectCapitals(title: string): string {
	let out = '';
	let at = 0;
	// a formula and the word it is part of ($\Lambda$CDM) whole: a style lower-cases \Lambda too
	for (const f of title.matchAll(/[^\s$]*\$[^$]*\$[^\s$]*/g)) {
		out += protectWords(title.slice(at, f.index)) + `{${f[0]}}`;
		at = (f.index ?? 0) + f[0].length;
	}
	return out + protectWords(title.slice(at));
}

function protectWords(text: string): string {
	return text.replace(/(^|[\s("'])([A-Za-z0-9][\w-]*)/g, (m, lead: string, word: string) =>
		word.split('-').some((part) => /^.+[A-Z]/.test(part)) ? `${lead}{${word}}` : m
	);
}

// words a key skips when it takes the title's first
const STOP = new Set(
	'a an the of on in for to and or with from by at as is are be via using toward towards into about over under between through is its'.split(
		' '
	)
);

/** Google Scholar's key shape: first author's surname, year, first significant title word */
function baseKey(fields: Record<string, string>): string {
	const names = fields.author ?? fields.editor ?? '';
	const first = names.split(/\s+and\s+/i)[0]?.trim() ?? '';
	// a braced name is an organisation, whose first significant word stands for it
	const corporate = /^\{[^{}]*\}$/.test(first);
	const person = corporate ? '' : first.includes(',') ? first.slice(0, first.indexOf(',')) : (first.split(/\s+/).pop() ?? '');
	const surname = corporate ? firstWord(first) : ascii(person);
	const year = fields.year ?? fields.date?.slice(0, 4) ?? '';
	const word = firstWord(fields.title ?? '');
	return surname + year + word || 'ref';
}

function firstWord(text: string): string {
	for (const w of plain(text).split(/[\s\-/:]+/)) {
		const a = ascii(w);
		if (a && !STOP.has(a)) return a;
	}
	return '';
}

/** a field as a reader sees it; formatting commands (\\textit{...}) keep their text */
function plain(text: string): string {
	return bibDisplayText(text.replace(/\\[a-zA-Z]{3,}\{/g, '{'));
}

/** lower-case ASCII letters and digits only: accents dropped, everything else gone */
function ascii(s: string): string {
	return bibDisplayText(s)
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/ß/g, 'ss')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
}

/** biber matches keys without regard to case, so a key that differs only in case is taken too */
function uniqueKey(base: string, taken: Iterable<string>): string {
	const have = new Set([...taken].map((k) => k.toLowerCase()));
	if (!have.has(base.toLowerCase())) return base;
	for (let n = 2; ; n++) if (!have.has(`${base}${n}`.toLowerCase())) return `${base}${n}`;
}
