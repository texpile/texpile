// Cite by DOI's one network call: the BibTeX for a DOI, through doi.org's content negotiation.
//
// doi.org hands the request on to whichever registry issued the DOI (Crossref for most
// journals, DataCite for arXiv and datasets, mEDRA, JaLC, ...), and each of them can answer
// application/x-bibtex. A registry that cannot sends its landing page instead, with a 200, so
// an answer counts only if it is an entry.

export type DoiLookup =
	{ ok: true; bibtex: string } | { ok: false; reason: 'not-found' | 'no-bibtex' | 'offline' | 'failed'; error?: string };

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 15_000;

export async function lookupDoi(doi: string, fetch: Fetch, userAgent: string): Promise<DoiLookup> {
	if (!/^10\.\d{4,9}\/\S+$/.test(doi)) return { ok: false, reason: 'not-found' };
	// each piece escaped on its own: the slashes are the DOI's, and doi.org reads them as such
	const url = `https://doi.org/${doi.split('/').map(encodeURIComponent).join('/')}`;
	let res: Response;
	try {
		res = await fetch(url, {
			headers: { Accept: 'application/x-bibtex; charset=utf-8', 'User-Agent': userAgent },
			redirect: 'follow',
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
	} catch (e) {
		return { ok: false, reason: 'offline', error: e instanceof Error ? e.message : String(e) };
	}
	if (res.status === 404) return { ok: false, reason: 'not-found' };
	if (res.status === 406 || res.status === 415) return { ok: false, reason: 'no-bibtex' };
	if (!res.ok) return { ok: false, reason: 'failed', error: `HTTP ${res.status}` };
	const bibtex = await res.text();
	return /^\s*@\w+\s*\{/.test(bibtex) ? { ok: true, bibtex } : { ok: false, reason: 'no-bibtex' };
}
