// citation dialog lookups beside doiLookup.ts: title search, ISBN and PubMed ID

export type SearchHit = {
	doi: string;
	title: string;
	/** surnames, or an organization's whole name */
	authors: string[];
	venue: string;
	year: string;
	/** how often it is cited, where the source knows (Crossref does, DataCite does not) */
	cites: number;
};

export type SearchResult = { ok: true; hits: SearchHit[] } | { ok: false; reason: 'offline' | 'failed'; error?: string };
export type EntryLookup = { ok: true; bibtex: string } | { ok: false; reason: 'not-found' | 'offline' | 'failed'; error?: string };
export type PmidLookup = { ok: true; doi: string } | EntryLookup;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 15_000;
// more than the dialog shows: the ranking needs room to lift the right paper out of a source's order
const CROSSREF_ROWS = 20;
const DATACITE_ROWS = 25;
// what a person would cite; Crossref also registers journals, issues, figures and peer reviews
const CITABLE = new Set([
	'journal-article',
	'proceedings-article',
	'book',
	'book-chapter',
	'monograph',
	'edited-book',
	'reference-book',
	'reference-entry',
	'posted-content',
	'report',
	'dissertation',
	'standard'
]);

export async function searchWorks(query: string, fetch: Fetch, userAgent: string): Promise<SearchResult> {
	const q = query.trim().slice(0, 300);
	const words =
		q
			.toLowerCase()
			.match(/[\p{L}\p{N}]+/gu)
			?.filter((w) => w.length > 1) ?? [];
	if (!words.length) return { ok: true, hits: [] };

	function datacite(query: string): Promise<Json> {
		const url =
			`https://api.datacite.org/dois?query=${encodeURIComponent(query)}&client-id=arxiv.content&page%5Bsize%5D=${DATACITE_ROWS}` +
			'&fields%5Bdois%5D=doi,titles,creators,publicationYear';
		return getJson(url, fetch, userAgent);
	}
	const crossref = getJson(
		`https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(q)}&rows=${CROSSREF_ROWS}` +
			'&select=DOI,title,author,container-title,publisher,issued,type,is-referenced-by-count',
		fetch,
		userAgent
	);
	const phrase = datacite(`titles.title:"${words.join(' ')}"`);
	const everyWord = datacite(words.map((w) => `(titles.title:${w} OR creators.familyName:${w})`).join(' AND '));

	const [c, p, e] = await Promise.all([crossref, phrase, everyWord]);
	if (!c.ok && !p.ok && !e.ok) {
		const offline = [c, p, e].some((a) => !a.ok && a.reason === 'offline');
		return { ok: false, reason: offline ? 'offline' : 'failed', error: c.error };
	}

	const hits: SearchHit[] = [];
	const seen = new Set<string>();
	function add(hit: SearchHit | null): void {
		if (!hit || seen.has(hit.doi.toLowerCase())) return;
		seen.add(hit.doi.toLowerCase());
		hits.push(hit);
	}
	if (c.ok) for (const item of asArray(field(field(c.body, 'message'), 'items'))) add(crossrefHit(item));
	for (const answer of [p, e]) if (answer.ok) for (const item of asArray(field(answer.body, 'data'))) add(dataciteHit(item));
	return { ok: true, hits };
}

export async function lookupIsbn(isbn: string, fetch: Fetch, userAgent: string): Promise<EntryLookup> {
	if (!/^\d{9}[\dX]$|^\d{13}$/.test(isbn)) return { ok: false, reason: 'not-found' };
	const [edition, work] = await Promise.all([
		getJson(`https://openlibrary.org/isbn/${isbn}.json`, fetch, userAgent),
		getJson(`https://openlibrary.org/search.json?isbn=${isbn}&fields=author_name&limit=1`, fetch, userAgent)
	]);
	if (!edition.ok) return failure(edition);
	const title = [text(field(edition.body, 'title')), text(field(edition.body, 'subtitle'))].filter(Boolean).join(': ');
	if (!title) return { ok: false, reason: 'not-found' };
	const authors = work.ok
		? asArray(field(asArray(field(work.body, 'docs'))[0], 'author_name'))
				.map(text)
				.filter(Boolean)
		: [];
	const fields: Record<string, string> = {
		title,
		// "Donald E. Knuth" is a name BibTeX splits itself; "van" and "de" particles included
		author: authors.join(' and '),
		publisher: asArray(field(edition.body, 'publishers')).map(text).find(Boolean) ?? '',
		year: /\b(\d{4})\b/.exec(text(field(edition.body, 'publish_date')))?.[1] ?? '',
		isbn
	};
	return { ok: true, bibtex: entry('book', 'isbn', fields) };
}

export async function lookupPmid(pmid: string, fetch: Fetch, userAgent: string): Promise<PmidLookup> {
	if (!/^\d{1,9}$/.test(pmid)) return { ok: false, reason: 'not-found' };
	const got = await getJson(
		`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json`,
		fetch,
		userAgent
	);
	if (!got.ok) return failure(got);
	const record = field(field(got.body, 'result'), pmid);
	if (!record || field(record, 'error') || !text(field(record, 'title'))) return { ok: false, reason: 'not-found' };

	const doi = asArray(field(record, 'articleids'))
		.filter((id) => text(field(id, 'idtype')) === 'doi')
		.map((id) => text(field(id, 'value')))
		.find((v) => /^10\.\d{4,9}\/\S+$/.test(v));
	if (doi) return { ok: true, doi };

	const names = asArray(field(record, 'authors'))
		.map((a) => (text(field(a, 'authtype')) === 'CollectiveName' ? `{${text(field(a, 'name'))}}` : medlineName(text(field(a, 'name')))))
		.filter(Boolean);
	const fields: Record<string, string> = {
		// the record's own punctuation: a closing full stop, and brackets around a translated title
		title: text(field(record, 'title'))
			.replace(/^\[(.*)\]\.?$/, '$1')
			.replace(/\.$/, ''),
		author: names.join(' and '),
		journal: text(field(record, 'fulljournalname')).replace(/\s*\([^)]*\)$/, '') || text(field(record, 'source')),
		volume: text(field(record, 'volume')),
		number: text(field(record, 'issue')),
		pages: fullRange(text(field(record, 'pages'))),
		year: /^(\d{4})/.exec(text(field(record, 'pubdate')))?.[1] ?? '',
		eprint: pmid,
		eprinttype: 'pubmed'
	};
	return { ok: true, bibtex: entry('article', `pmid${pmid}`, fields) };
}

type Json = { ok: true; body: unknown } | { ok: false; reason: 'offline' | 'failed'; status?: number; error?: string };

async function getJson(url: string, fetch: Fetch, userAgent: string): Promise<Json> {
	let res: Response;
	try {
		res = await fetch(url, {
			headers: { Accept: 'application/json', 'User-Agent': userAgent },
			redirect: 'follow',
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
	} catch (e) {
		return { ok: false, reason: 'offline', error: e instanceof Error ? e.message : String(e) };
	}
	if (!res.ok) return { ok: false, reason: 'failed', status: res.status, error: `HTTP ${res.status}` };
	try {
		return { ok: true, body: await res.json() };
	} catch {
		return { ok: false, reason: 'failed', error: 'not JSON' };
	}
}

function failure(got: Extract<Json, { ok: false }>): EntryLookup {
	return got.status === 404 ? { ok: false, reason: 'not-found' } : { ok: false, reason: got.reason, error: got.error };
}

function crossrefHit(item: unknown): SearchHit | null {
	const doi = text(field(item, 'DOI'));
	const title = plain(text(asArray(field(item, 'title'))[0]));
	if (!doi || !title || !CITABLE.has(text(field(item, 'type')))) return null;
	const year = asArray(asArray(field(field(item, 'issued'), 'date-parts'))[0])[0];
	return {
		doi,
		title,
		authors: asArray(field(item, 'author'))
			.map((a) => text(field(a, 'family')) || text(field(a, 'name')))
			.filter(Boolean),
		venue: plain(text(asArray(field(item, 'container-title'))[0])) || text(field(item, 'publisher')),
		year: typeof year === 'number' ? String(year) : '',
		cites: Number(field(item, 'is-referenced-by-count')) || 0
	};
}

function dataciteHit(item: unknown): SearchHit | null {
	const a = field(item, 'attributes');
	const doi = text(field(a, 'doi'));
	const title = plain(text(field(asArray(field(a, 'titles'))[0], 'title')));
	if (!doi || !title) return null;
	return {
		// DataCite lower-cases the prefix; arXiv writes it 10.48550/arXiv.<id>
		doi: doi.replace(/^10\.48550\/arxiv\./i, '10.48550/arXiv.'),
		title,
		authors: asArray(field(a, 'creators'))
			.map((c) => text(field(c, 'familyName')) || text(field(c, 'name')))
			.filter(Boolean),
		venue: 'arXiv',
		year: String(field(a, 'publicationYear') ?? ''),
		cites: 0
	};
}

/** MEDLINE's "Smith JA" as BibTeX's "Smith, J. A.", and its capitals-only old records in title case */
function medlineName(name: string): string {
	const m = /^(.*\S)\s+([A-Z]{1,4})$/.exec(name.trim());
	if (!m) return name.trim();
	const family = m[1] === m[1].toUpperCase() ? m[1].toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase()) : m[1];
	return `${family}, ${m[2].split('').join('. ')}.`;
}

/** "737-8" is 737 to 738: MEDLINE drops the leading digits the end page shares with the start */
function fullRange(pages: string): string {
	const m = /^(\d+)-(\d+)$/.exec(pages);
	if (!m || m[2].length >= m[1].length) return pages.replace('-', '--');
	return `${m[1]}--${m[1].slice(0, m[1].length - m[2].length)}${m[2]}`;
}

function entry(type: string, key: string, fields: Record<string, string>): string {
	// values are plain text; only an organization author keeps its braces, to stay one name
	const lines = Object.entries(fields)
		.filter(([, v]) => v)
		.map(([k, v]) => `  ${k} = {${k === 'author' ? v : v.replace(/[{}]/g, '')}},`);
	return `@${type}{${key},\n${lines.join('\n')}\n}`;
}

/** registry titles carry markup (<i>, <sub>, MathML) and entities; the list shows words */
function plain(s: string): string {
	return s
		.replace(/<[^>]+>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();
}

function field(o: unknown, name: string): unknown {
	return o && typeof o === 'object' ? (o as Record<string, unknown>)[name] : undefined;
}

function asArray(o: unknown): unknown[] {
	return Array.isArray(o) ? o : [];
}

function text(o: unknown): string {
	return typeof o === 'string' ? o.trim() : typeof o === 'number' ? String(o) : '';
}
