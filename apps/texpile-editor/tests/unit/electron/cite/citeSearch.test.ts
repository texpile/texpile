import { describe, expect, it, vi } from 'vitest';
import { lookupIsbn, lookupPmid, searchWorks } from '../../../../../../electron/src/cite/citeSearch';

// trimmed from the services' real answers
const CROSSREF = {
	message: {
		items: [
			{
				DOI: '10.1109/cvpr.2016.90',
				title: ['Deep Residual Learning for Image Recognition'],
				author: [
					{ given: 'Kaiming', family: 'He' },
					{ given: 'Xiangyu', family: 'Zhang' }
				],
				'container-title': ['2016 IEEE Conference on Computer Vision and Pattern Recognition (CVPR)'],
				issued: { 'date-parts': [[2016, 6]] },
				type: 'proceedings-article',
				'is-referenced-by-count': 175414
			},
			{
				DOI: '10.1109/tcad.2025.3579326/mm1',
				title: ['Hardware Accelerator for Short-Read DNA Sequence Alignment'],
				type: 'component'
			},
			{
				DOI: '10.1000/markup',
				title: ['The <i>in vivo</i> case &amp; more'],
				author: [{ name: 'The pandas development team' }],
				publisher: 'Zenodo',
				issued: { 'date-parts': [[2020]] },
				type: 'report'
			}
		]
	}
};
const DATACITE = {
	data: [
		{
			attributes: {
				doi: '10.48550/arxiv.1512.03385',
				titles: [{ title: 'Deep Residual Learning for Image Recognition' }],
				creators: [{ name: 'He, Kaiming', familyName: 'He' }],
				publicationYear: 2015
			}
		}
	]
};
const EDITION = { title: 'The TeXbook', publishers: ['Addison-Wesley'], publish_date: '1986' };
const WORK = { docs: [{ author_name: ['Donald E. Knuth'] }] };
const PUBMED_DOI = {
	result: {
		uids: ['19451168'],
		19451168: {
			title: 'Fast and accurate short read alignment with Burrows-Wheeler transform.',
			articleids: [
				{ idtype: 'pubmed', value: '19451168' },
				{ idtype: 'doi', value: '10.1093/bioinformatics/btp324' }
			]
		}
	}
};
const PUBMED_OLD = {
	result: {
		uids: ['100'],
		100: {
			title: 'Bovine mannosidosis--a model lysosomal storage disease.',
			authors: [
				{ name: 'Jolly RD', authtype: 'Author' },
				{ name: 'THOMPSON KG', authtype: 'Author' },
				{ name: 'WHO Study Group', authtype: 'CollectiveName' }
			],
			source: 'Birth Defects Orig Artic Ser',
			fulljournalname: 'Birth defects original article series (New York)',
			pubdate: '1975',
			volume: '11',
			issue: '6',
			pages: '273-8',
			articleids: [{ idtype: 'pubmed', value: '100' }]
		}
	}
};

/** answers each URL whose text contains a key with that key's JSON; anything else 404 */
function serving(routes: Record<string, unknown>) {
	return vi.fn(async (url: string) => {
		const hit = Object.keys(routes).find((k) => url.includes(k));
		return hit ? new Response(JSON.stringify(routes[hit]), { status: 200 }) : new Response('{}', { status: 404 });
	});
}

describe('searchWorks', () => {
	it('asks Crossref once and arXiv records twice: as a title phrase, and word by word over titles and surnames', async () => {
		const fetch = serving({ 'api.crossref.org': CROSSREF, 'api.datacite.org': DATACITE });
		await searchWorks('Vaswani: attention!', fetch, 'Texpile/test');
		const urls = fetch.mock.calls.map((c) => decodeURIComponent(c[0] as string));
		expect(urls[0]).toContain('https://api.crossref.org/works?query.bibliographic=Vaswani: attention!');
		expect(urls[1]).toContain('query=titles.title:"vaswani attention"&client-id=arxiv.content');
		expect(urls[2]).toContain(
			'query=(titles.title:vaswani OR creators.familyName:vaswani) AND (titles.title:attention OR creators.familyName:attention)'
		);
		expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ 'User-Agent': 'Texpile/test' });
	});

	it('keeps what a person would cite, as plain text, and each DOI once', async () => {
		const got = await searchWorks('deep residual', serving({ 'api.crossref.org': CROSSREF, 'api.datacite.org': DATACITE }), 'ua');
		expect(got).toEqual({
			ok: true,
			hits: [
				{
					doi: '10.1109/cvpr.2016.90',
					title: 'Deep Residual Learning for Image Recognition',
					authors: ['He', 'Zhang'],
					venue: '2016 IEEE Conference on Computer Vision and Pattern Recognition (CVPR)',
					year: '2016',
					cites: 175414
				},
				{
					doi: '10.1000/markup',
					title: 'The in vivo case & more',
					authors: ['The pandas development team'],
					venue: 'Zenodo',
					year: '2020',
					cites: 0
				},
				// arXiv writes its prefix 10.48550/arXiv.<id>; the phrase and word queries both returned it
				{
					doi: '10.48550/arXiv.1512.03385',
					title: 'Deep Residual Learning for Image Recognition',
					authors: ['He'],
					venue: 'arXiv',
					year: '2015',
					cites: 0
				}
			]
		});
	});

	it('answers with the sources that did answer', async () => {
		const got = await searchWorks('deep residual', serving({ 'api.datacite.org': DATACITE }), 'ua');
		expect(got.ok && got.hits.map((h) => h.doi)).toEqual(['10.48550/arXiv.1512.03385']);
	});

	it('says offline only when no source could be reached', async () => {
		const down = vi.fn(async () => {
			throw new TypeError('net::ERR_INTERNET_DISCONNECTED');
		});
		expect(await searchWorks('deep residual', down, 'ua')).toEqual({
			ok: false,
			reason: 'offline',
			error: 'net::ERR_INTERNET_DISCONNECTED'
		});
		expect(await searchWorks('deep residual', serving({}), 'ua')).toEqual({ ok: false, reason: 'failed', error: 'HTTP 404' });
	});

	it('sends nothing for a query without a word in it', async () => {
		const fetch = serving({});
		expect(await searchWorks(' - ', fetch, 'ua')).toEqual({ ok: true, hits: [] });
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe('lookupIsbn', () => {
	it("builds a book entry from the edition and its work's authors", async () => {
		const fetch = serving({ 'isbn/9780201134476.json': EDITION, 'search.json?isbn=9780201134476': WORK });
		expect(await lookupIsbn('9780201134476', fetch, 'ua')).toEqual({
			ok: true,
			bibtex:
				'@book{isbn,\n  title = {The TeXbook},\n  author = {Donald E. Knuth},\n  publisher = {Addison-Wesley},\n  year = {1986},\n  isbn = {9780201134476},\n}'
		});
	});

	it('reports a book Open Library does not have', async () => {
		expect(await lookupIsbn('9780201134476', serving({}), 'ua')).toEqual({ ok: false, reason: 'not-found' });
	});
});

describe('lookupPmid', () => {
	it("hands back a record's DOI, so the entry comes from its publisher", async () => {
		expect(await lookupPmid('19451168', serving({ 'id=19451168': PUBMED_DOI }), 'ua')).toEqual({
			ok: true,
			doi: '10.1093/bioinformatics/btp324'
		});
	});

	it('builds the entry of an old record that has no DOI', async () => {
		const got = await lookupPmid('100', serving({ 'id=100': PUBMED_OLD }), 'ua');
		expect(got).toEqual({
			ok: true,
			bibtex: [
				'@article{pmid100,',
				'  title = {Bovine mannosidosis--a model lysosomal storage disease},',
				'  author = {Jolly, R. D. and Thompson, K. G. and {WHO Study Group}},',
				'  journal = {Birth defects original article series},',
				'  volume = {11},',
				'  number = {6},',
				'  pages = {273--278},',
				'  year = {1975},',
				'  eprint = {100},',
				'  eprinttype = {pubmed},',
				'}'
			].join('\n')
		});
	});

	it('reports an ID PubMed has no record for', async () => {
		const missing = { result: { uids: ['99999999'], 99999999: { error: 'cannot get document summary' } } };
		expect(await lookupPmid('99999999', serving({ 'id=99999999': missing }), 'ua')).toEqual({ ok: false, reason: 'not-found' });
	});
});
