import { describe, expect, it } from 'vitest';
import { rankHits, type SearchHit } from '$lib/cite/searchRank';
// real Crossref and DataCite answers (September 2026), unranked, authors cut to three
import recorded from '../../../fixtures/cite/search-hits.json';

const answers = recorded as Record<string, SearchHit[]>;
const top = (query: string, n = 1) => rankHits(query, answers[query], n).map((h) => h.doi);

describe('rankHits on real search answers', () => {
	it('finds a conference paper with no DOI of its own through its arXiv record', () => {
		// Crossref's own first hit is "Is Attention All You Need?" (2025)
		expect(answers['attention is all you need'][0].title).toBe('Is Attention All You Need?');
		expect(top('attention is all you need')).toEqual(['10.48550/arXiv.1706.03762']);
	});

	it('puts the exact title first, the version cited 175,000 times before its preprint', () => {
		expect(top('deep residual learning for image recognition', 3)).toEqual([
			'10.1109/cvpr.2016.90',
			'10.48550/arXiv.1512.03385',
			'10.3390/app12188972'
		]);
	});

	it('reads a surname and a year typed with the title words', () => {
		expect(top('vaswani attention')).toEqual(['10.48550/arXiv.1706.03762']);
		expect(top('he 2016 deep residual learning')).toEqual(['10.1109/cvpr.2016.90']);
	});

	it('ranks the original above the later paper with a near-identical title', () => {
		expect(top('fast and accurate short read alignment', 2)).toEqual(['10.1093/bioinformatics/btp324', '10.1186/s44342-024-00012-5']);
	});

	it('shows two versions of one work at most, however many copies were uploaded', () => {
		const paper = (h: SearchHit) => h.title === 'Attention Is All You Need' && h.authors[0] === 'Vaswani';
		expect(answers['attention is all you need'].filter(paper)).toHaveLength(8);
		const shown = rankHits('attention is all you need', answers['attention is all you need']);
		expect(shown.filter(paper)).toHaveLength(2);
		// a different work under the same title is a different work
		expect(shown.map((h) => h.doi)).toContain('10.1201/9781003561460-19');
	});
});

describe('rankHits', () => {
	const hit = (doi: string, title: string, extra: Partial<SearchHit> = {}): SearchHit => ({
		doi,
		title,
		authors: ['Smith'],
		venue: '',
		year: '2020',
		cites: 0,
		...extra
	});

	it('folds accents and case on both sides', () => {
		const hits = [hit('10.1/a', 'Quantum mechanics'), hit('10.1/b', 'Über die Schrödinger-Gleichung')];
		expect(rankHits('uber die schrodinger gleichung', hits, 1)[0].doi).toBe('10.1/b');
	});

	it('lists a DOI once when two sources both returned it', () => {
		expect(rankHits('paper', [hit('10.1/A', 'Paper'), hit('10.1/a', 'Paper')])).toHaveLength(1);
	});

	it('breaks a tie between equal matches on citations', () => {
		const hits = [
			hit('10.1/few', 'Graph neural networks', { cites: 3, authors: ['Lee'] }),
			hit('10.1/many', 'Graph neural networks', { cites: 900, authors: ['Kim'] })
		];
		expect(rankHits('graph neural networks', hits, 1)[0].doi).toBe('10.1/many');
	});
});
