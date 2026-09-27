// What the Cite by DOI box accepts: a DOI in any of the forms people copy it in (bare, doi:,
// a doi.org link, a publisher page that carries it in the path) or an arXiv identifier (new or
// old style, arXiv: prefix, abs or pdf link). Text in, identifier out, so it tests without a
// network.
//
// arXiv papers resolve through their DataCite DOI (10.48550/arXiv.<id>), which doi.org answers
// like any other; the version suffix is dropped because the DOI names the paper, not a revision.

export type WorkId = { kind: 'doi'; doi: string } | { kind: 'arxiv'; id: string; doi: string };

// a DOI is 10.<registrant>/<suffix>, and the suffix may hold almost anything but whitespace
const DOI = /\b(10\.\d{4,9}\/[^\s"<>]+)/i;
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

	return arxivId(text.replace(/^arxiv:\s*/i, ''));
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
	// a link's query or fragment is the page's, never the DOI's
	if (isLink) doi = doi.replace(/[?#].*$/, '').replace(/\/(?:full|abstract|pdf|epdf|html|meta|fulltext)\/?$/i, '');
	// sentence punctuation a DOI was quoted with: a DOI may end in ")" only when it also opened one
	doi = doi.replace(/[.,;:'"\]}>]+$/, '');
	while (doi.endsWith(')') && count(doi, '(') < count(doi, ')')) doi = doi.slice(0, -1);
	return doi.length > 8 ? doi : null;
}

function count(s: string, ch: string): number {
	return s.split(ch).length - 1;
}
