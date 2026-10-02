import { describe, expect, it } from 'vitest';
import { isbn13, parseWorkId, workKey, workLabel } from '$lib/cite/doiInput';

describe('parseWorkId: DOIs', () => {
	it('takes a bare DOI and the prefixes people copy it with', () => {
		for (const input of [
			'10.1038/171737a0',
			'doi:10.1038/171737a0',
			'DOI: 10.1038/171737a0',
			'https://doi.org/10.1038/171737a0',
			'http://dx.doi.org/10.1038/171737a0',
			'  10.1038/171737a0  '
		]) {
			expect(parseWorkId(input), input).toEqual({ kind: 'doi', doi: '10.1038/171737a0' });
		}
	});

	it('finds the DOI in a publisher page link', () => {
		expect(parseWorkId('https://dl.acm.org/doi/10.1145/3386569.3392485')).toEqual({ kind: 'doi', doi: '10.1145/3386569.3392485' });
		expect(parseWorkId('https://onlinelibrary.wiley.com/doi/full/10.1002/anie.201915678')).toEqual({
			kind: 'doi',
			doi: '10.1002/anie.201915678'
		});
		expect(parseWorkId('https://www.frontiersin.org/articles/10.3389/fpsyg.2020.01234/full')).toEqual({
			kind: 'doi',
			doi: '10.3389/fpsyg.2020.01234'
		});
		expect(parseWorkId('https://doi.org/10.1000%2F182?via=home#top')).toEqual({ kind: 'doi', doi: '10.1000/182' });
	});

	it('leaves out what a PDF, preprint or query link adds to the DOI', () => {
		expect(parseWorkId('https://link.springer.com/content/pdf/10.1007/s00134-020-06022-5.pdf')).toEqual({
			kind: 'doi',
			doi: '10.1007/s00134-020-06022-5'
		});
		for (const link of [
			'https://www.biorxiv.org/content/10.1101/2020.03.22.002386v1',
			'https://www.biorxiv.org/content/10.1101/2020.03.22.002386v2.full',
			'https://www.medrxiv.org/content/10.1101/2020.03.22.002386v3.full.pdf'
		]) {
			expect(parseWorkId(link), link).toEqual({ kind: 'doi', doi: '10.1101/2020.03.22.002386' });
		}
		expect(parseWorkId('https://journals.plos.org/plosone/article/file?id=10.1371/journal.pone.0230978&type=printable')).toEqual({
			kind: 'doi',
			doi: '10.1371/journal.pone.0230978'
		});
	});

	it('keeps slashes and brackets that belong to the DOI', () => {
		expect(parseWorkId('10.1016/S0140-6736(20)30183-5')).toEqual({ kind: 'doi', doi: '10.1016/S0140-6736(20)30183-5' });
		expect(parseWorkId('10.1007/978-3-030-58452-8_13')).toEqual({ kind: 'doi', doi: '10.1007/978-3-030-58452-8_13' });
	});

	it('keeps a Wiley SICI DOI whole, angle brackets and all, typed or as an encoded link', () => {
		const sici = '10.1002/(SICI)1097-0258(19980430)17:8<857::AID-SIM777>3.0.CO;2-E';
		expect(parseWorkId(sici)).toEqual({ kind: 'doi', doi: sici });
		expect(parseWorkId('https://doi.org/10.1002/(SICI)1097-0258(19980430)17:8%3C857::AID-SIM777%3E3.0.CO;2-E')).toEqual({
			kind: 'doi',
			doi: sici
		});
		expect(parseWorkId('<a href="x">10.1038/171737a0</a>')).toEqual({ kind: 'doi', doi: '10.1038/171737a0' });
	});

	it('drops the punctuation a DOI was quoted with', () => {
		expect(parseWorkId('(see 10.1038/171737a0).')).toEqual({ kind: 'doi', doi: '10.1038/171737a0' });
		expect(parseWorkId('"10.1038/171737a0",')).toEqual({ kind: 'doi', doi: '10.1038/171737a0' });
	});
});

describe('parseWorkId: arXiv', () => {
	const vaswani = { kind: 'arxiv', id: '1706.03762', doi: '10.48550/arXiv.1706.03762' };

	it('takes new-style IDs with or without a prefix and version', () => {
		for (const input of ['1706.03762', 'arXiv:1706.03762', 'arxiv: 1706.03762v5', '1706.03762v7']) {
			expect(parseWorkId(input), input).toEqual(vaswani);
		}
		expect(parseWorkId('2101.00001')).toEqual({ kind: 'arxiv', id: '2101.00001', doi: '10.48550/arXiv.2101.00001' });
	});

	it('takes abs and pdf links', () => {
		for (const input of [
			'https://arxiv.org/abs/1706.03762',
			'https://arxiv.org/abs/1706.03762v5',
			'https://arxiv.org/pdf/1706.03762v5.pdf',
			'https://arxiv.org/pdf/1706.03762',
			'arxiv.org/abs/1706.03762?context=cs'
		]) {
			expect(parseWorkId(input), input).toEqual(vaswani);
		}
	});

	it('takes old-style IDs', () => {
		expect(parseWorkId('hep-th/9901001')).toEqual({ kind: 'arxiv', id: 'hep-th/9901001', doi: '10.48550/arXiv.hep-th/9901001' });
		expect(parseWorkId('arXiv:math.GT/0309136')).toEqual({ kind: 'arxiv', id: 'math.GT/0309136', doi: '10.48550/arXiv.math.GT/0309136' });
		expect(parseWorkId('https://arxiv.org/abs/hep-th/9901001v2')).toEqual({
			kind: 'arxiv',
			id: 'hep-th/9901001',
			doi: '10.48550/arXiv.hep-th/9901001'
		});
	});

	it("treats arXiv's own DOI as the arXiv paper", () => {
		expect(parseWorkId('10.48550/arXiv.1706.03762')).toEqual(vaswani);
		expect(parseWorkId('https://doi.org/10.48550/ARXIV.1706.03762')).toEqual(vaswani);
	});
});

describe('parseWorkId: books and PubMed records', () => {
	it('takes an ISBN in either length, grouped or not, and names it by its 13 digits', () => {
		for (const input of ['9780201134476', '978-0-201-13447-6', 'ISBN 978-0-201-13447-6', 'isbn: 0201134470', 'ISBN-10: 0-201-13447-0']) {
			expect(parseWorkId(input), input).toEqual({ kind: 'isbn', isbn: '9780201134476' });
		}
		// an ISBN-10 can end in X
		expect(isbn13('0-8044-2957-X')).toBe('9780804429573');
	});

	it('rejects a number whose check digit is wrong', () => {
		expect(parseWorkId('978-0-201-13447-5')).toBeNull();
		expect(parseWorkId('0201134471')).toBeNull();
	});

	it('takes a PubMed ID only with its prefix or link, since a bare number could be anything', () => {
		for (const input of [
			'PMID: 19451168',
			'pmid19451168',
			'https://pubmed.ncbi.nlm.nih.gov/19451168/',
			'pubmed.ncbi.nlm.nih.gov/19451168?x=1'
		]) {
			expect(parseWorkId(input), input).toEqual({ kind: 'pmid', pmid: '19451168' });
		}
		expect(parseWorkId('19451168')).toBeNull();
	});

	it('names each kind of work for the dialog, and keys respellings of one work alike', () => {
		expect(workLabel({ kind: 'isbn', isbn: '9780201134476' })).toBe('ISBN 9780201134476');
		expect(workLabel({ kind: 'pmid', pmid: '100' })).toBe('PMID 100');
		expect(workKey(parseWorkId('0201134470')!)).toBe(workKey(parseWorkId('978-0-201-13447-6')!));
		expect(workKey(parseWorkId('10.1109/CVPR.2016.90')!)).toBe(workKey(parseWorkId('https://doi.org/10.1109/cvpr.2016.90')!));
	});
});

describe('parseWorkId: not a work', () => {
	it('knows which new-style numbers arXiv has issued', () => {
		expect(parseWorkId('0704.0001')).toMatchObject({ id: '0704.0001' }); // the first one
		expect(parseWorkId('1412.8765')).toMatchObject({ id: '1412.8765' });
		for (const input of ['0703.0001', '1706.0376', '1412.87654', '1713.00001']) {
			expect(parseWorkId(input), input).toBeNull();
		}
	});

	it('returns null for text that names nothing', () => {
		for (const input of ['', '   ', 'attention is all you need', '10.1038', 'https://example.com/paper', '2021']) {
			expect(parseWorkId(input), input).toBeNull();
		}
	});
});
