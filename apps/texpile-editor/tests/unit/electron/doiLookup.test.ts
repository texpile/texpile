import { describe, expect, it, vi } from 'vitest';
import { lookupDoi } from '../../../../../electron/src/doiLookup';

const ENTRY = '@article{Watson_1953, title={Molecular Structure of Nucleic Acids}, DOI={10.1038/171737a0}}';

function answering(status: number, body: string) {
	return vi.fn(async () => new Response(body, { status }));
}

describe('lookupDoi', () => {
	it('asks doi.org for BibTeX, escaping each part of the DOI but not its slashes', async () => {
		const fetch = answering(200, ENTRY);
		expect(await lookupDoi('10.1016/S0140-6736(20)30183-5#x', fetch, 'Texpile/test')).toEqual({ ok: true, bibtex: ENTRY });
		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://doi.org/10.1016/S0140-6736(20)30183-5%23x');
		expect(init.headers).toMatchObject({ Accept: 'application/x-bibtex; charset=utf-8', 'User-Agent': 'Texpile/test' });
	});

	it('returns the entry a registry sends', async () => {
		expect(await lookupDoi('10.1038/171737a0', answering(200, ` ${ENTRY}`), 'ua')).toEqual({ ok: true, bibtex: ` ${ENTRY}` });
	});

	it('tells a DOI nobody registered from a registry that has no BibTeX', async () => {
		expect(await lookupDoi('10.1038/nope', answering(404, 'DOI Not Found'), 'ua')).toEqual({ ok: false, reason: 'not-found' });
		expect(await lookupDoi('10.1038/x', answering(406, ''), 'ua')).toEqual({ ok: false, reason: 'no-bibtex' });
		// a registry without content negotiation redirects to its landing page, which answers 200
		expect(await lookupDoi('10.1038/x', answering(200, '<!doctype html><title>Article</title>'), 'ua')).toEqual({
			ok: false,
			reason: 'no-bibtex'
		});
	});

	it('reports a network failure as offline and anything else by its status', async () => {
		const down = vi.fn(async () => {
			throw new TypeError('net::ERR_INTERNET_DISCONNECTED');
		});
		expect(await lookupDoi('10.1038/171737a0', down, 'ua')).toEqual({
			ok: false,
			reason: 'offline',
			error: 'net::ERR_INTERNET_DISCONNECTED'
		});
		expect(await lookupDoi('10.1038/171737a0', answering(503, ''), 'ua')).toEqual({ ok: false, reason: 'failed', error: 'HTTP 503' });
	});

	it('sends nothing for text that is not a DOI', async () => {
		const fetch = answering(200, ENTRY);
		expect(await lookupDoi('not a doi', fetch, 'ua')).toEqual({ ok: false, reason: 'not-found' });
		expect(fetch).not.toHaveBeenCalled();
	});
});
