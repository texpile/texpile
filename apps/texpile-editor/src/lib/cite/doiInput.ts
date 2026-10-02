// the identifiers the citation box accepts (DOI, arXiv, ISBN, PubMed ID); anything else is a title to search for
//
// arXiv papers resolve through their DataCite DOI (10.48550/arXiv.<id>), which doi.org answers
// like any other; the version suffix is dropped because the DOI names the paper, not a revision.

export type WorkId =
	| { kind: 'doi'; doi: string }
	| { kind: 'arxiv'; id: string; doi: string }
	/** always the 13-digit form, so the two spellings of one book match */
	| { kind: 'isbn'; isbn: string }
	| { kind: 'pmid'; pmid: string };

// a DOI is 10.<registrant>/<suffix>, and the suffix may hold almost anything but whitespace; <...>
// only as a pair with no slash in it, as Wiley's SICI DOIs have (17:8<857::AID-SIM777>3.0.CO;2-E)
const DOI = /\b(10\.\d{4,9}\/(?:[^\s"<>]|<[^\s"<>/]*>)+)/i;
// new style YYMM.NNNNN (four digits after the dot until the end of 2014, five since), old style
// hep-th/9901001 or math.GT/0309136
const ARXIV_NEW = /^((\d\d)(\d\d)\.(\d{4,5}))(?:v\d+)?$/;
const ARXIV_OLD = /^([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/;
// DataCite's own DOI for an arXiv paper; recognised so it gets the arXiv treatment
const ARXIV_DOI = /^10\.48550\/arxiv\.(.+)$/i;

export function arxivDoi(id: string): string {
	return `10.48550/arXiv.${id}`;
}

/** the work `input` names, or null when it names none */
export function parseWorkId(input: string): WorkId | null {
	const text = input.trim();
	if (!text) return null;

	const arxivLink = /arxiv\.org\/(?:abs|pdf)\/(.+?)(?:\.pdf)?\/?(?:[?#].*)?$/i.exec(text);
	if (arxivLink) return arxivId(arxivLink[1]);

	const doi = findDoi(text);
	if (doi) {
		const viaArxiv = ARXIV_DOI.exec(doi);
		return (viaArxiv && arxivId(viaArxiv[1])) || { kind: 'doi', doi };
	}

	const arxiv = arxivId(text.replace(/^arxiv:\s*/i, ''));
	if (arxiv) return arxiv;

	// a PubMed ID is a bare number, which a year or a page is too: only its prefix or link says so
	const pmid = /^pmid:?\s*(\d{1,9})$/i.exec(text) ?? /pubmed\.ncbi\.nlm\.nih\.gov\/(\d{1,9})\/?(?:[?#].*)?$/i.exec(text);
	if (pmid) return { kind: 'pmid', pmid: pmid[1] };

	const isbn = isbn13(text.replace(/^isbn(?:-1[03])?:?\s*/i, ''));
	return isbn ? { kind: 'isbn', isbn } : null;
}

/** one string per work, for telling a respelled identifier from a different one */
export function workKey(id: WorkId): string {
	switch (id.kind) {
		case 'isbn':
			return `isbn:${id.isbn}`;
		case 'pmid':
			return `pmid:${id.pmid}`;
		default:
			return id.doi.toLowerCase();
	}
}

/** how the dialog names the identifier while it looks it up */
export function workLabel(id: WorkId): string {
	switch (id.kind) {
		case 'arxiv':
			return `arXiv:${id.id}`;
		case 'isbn':
			return `ISBN ${id.isbn}`;
		case 'pmid':
			return `PMID ${id.pmid}`;
		default:
			return id.doi;
	}
}

/** an ISBN as its 13 digits when `raw` is a valid ISBN-10 or ISBN-13 (check digit included), else null */
export function isbn13(raw: string): string | null {
	const s = raw.trim();
	// hyphens or spaces between the groups, never other characters
	if (!/^[\d][\d -]{8,15}[\dXx]$/.test(s)) return null;
	const digits = s.replace(/[ -]/g, '').toUpperCase();
	if (digits.length === 10 && /^\d{9}[\dX]$/.test(digits)) {
		let sum = 0;
		for (let i = 0; i < 10; i++) sum += (digits[i] === 'X' ? 10 : Number(digits[i])) * (10 - i);
		if (sum % 11 !== 0) return null;
		return withCheck13(`978${digits.slice(0, 9)}`);
	}
	if (digits.length === 13 && /^97[89]\d{10}$/.test(digits)) {
		return withCheck13(digits.slice(0, 12)) === digits ? digits : null;
	}
	return null;
}

function withCheck13(first12: string): string {
	let sum = 0;
	for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 ? 3 : 1);
	return first12 + String((10 - (sum % 10)) % 10);
}

function arxivId(raw: string): WorkId | null {
	const s = raw.trim();
	const n = ARXIV_NEW.exec(s);
	const id = n ? (validNew(Number(n[2]), Number(n[3]), n[4].length) ? n[1] : null) : ARXIV_OLD.exec(s)?.[1];
	return id ? { kind: 'arxiv', id, doi: arxivDoi(id) } : null;
}

// new-style numbering began in April 2007 and went from four digits to five in January 2015
function validNew(yy: number, mm: number, digits: number): boolean {
	if (mm < 1 || mm > 12 || yy * 100 + mm < 704) return false;
	return digits === (yy >= 15 ? 5 : 4);
}

function findDoi(text: string): string | null {
	const isLink = /^https?:\/\//i.test(text);
	// a copied link can arrive percent-encoded (10.1000%2Fxyz); a malformed escape keeps the text as is
	let s = text;
	if (isLink) {
		try {
			s = decodeURIComponent(text);
		} catch {
			/* keep it encoded */
		}
	}
	const m = DOI.exec(s);
	if (!m) return null;
	let doi = m[1];
	// what the link adds: the page's query and fragment, the next parameter after ?id=<doi>, .pdf, bioRxiv's v1.full
	if (isLink)
		doi = doi
			.replace(/[?#&].*$/, '')
			.replace(/\/(?:full|abstract|pdf|epdf|html|meta|fulltext)\/?$/i, '')
			.replace(/\.pdf$/i, '')
			.replace(/^(10\.1101\/[\d.]+)v\d+(?:\.(?:full|abstract))?$/i, '$1');
	// sentence punctuation a DOI was quoted with: a DOI may end in ")" only when it also opened one
	doi = doi.replace(/[.,;:'"\]}>]+$/, '');
	while (doi.endsWith(')') && count(doi, '(') < count(doi, ')')) doi = doi.slice(0, -1);
	return doi.length > 8 ? doi : null;
}

function count(s: string, ch: string): number {
	return s.split(ch).length - 1;
}
