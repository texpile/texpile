import { describe, expect, it } from 'vitest';
import { parseWorkId } from '$lib/cite/doiInput';

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

	it('keeps slashes and brackets that belong to the DOI', () => {
		expect(parseWorkId('10.1016/S0140-6736(20)30183-5')).toEqual({ kind: 'doi', doi: '10.1016/S0140-6736(20)30183-5' });
		expect(parseWorkId('10.1007/978-3-030-58452-8_13')).toEqual({ kind: 'doi', doi: '10.1007/978-3-030-58452-8_13' });
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
