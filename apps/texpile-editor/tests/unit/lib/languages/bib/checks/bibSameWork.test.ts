import { describe, expect, it } from 'vitest';
import { sameWorkAs, sameWorkIn, workIds } from '$lib/languages/bib/checks/bibSameWork';
import type { BiblatexReference } from '$lib/languages/bib/types';

const ref = (key: string, fields: Record<string, string>, entrytype = 'article'): BiblatexReference => ({ key, entrytype, ...fields });

describe('workIds', () => {
	it('reads a DOI however it is written', () => {
		expect(workIds(ref('a', { doi: 'https://doi.org/10.1109/CVPR.2016.90' }))).toEqual([{ by: 'doi', id: '10.1109/cvpr.2016.90' }]);
		expect(workIds(ref('a', { doi: 'doi: 10.1109/CVPR.2016.90' }))).toEqual([{ by: 'doi', id: '10.1109/cvpr.2016.90' }]);
		expect(workIds(ref('a', { doi: 'not a doi' }))).toEqual([]);
	});

	it('reads an arXiv number from the eprint, the link, arXiv DOI and a Scholar journal line, without its version', () => {
		const arxiv = (fields: Record<string, string>) => workIds(ref('a', fields)).find((w) => w.by === 'arxiv')?.id;
		expect(arxiv({ eprint: '1706.03762v5', eprinttype: 'arxiv' })).toBe('1706.03762');
		expect(arxiv({ eprint: 'arXiv:1706.03762', archiveprefix: 'arXiv' })).toBe('1706.03762');
		expect(arxiv({ eprint: 'hep-th/9711200' })).toBe('hep-th/9711200');
		expect(arxiv({ url: 'https://arxiv.org/pdf/1706.03762v7.pdf' })).toBe('1706.03762');
		expect(arxiv({ doi: '10.48550/arXiv.1706.03762' })).toBe('1706.03762');
		expect(arxiv({ journal: 'arXiv preprint arXiv:1810.04805' })).toBe('1810.04805');
		// a PubMed ID in biblatex's eprint pair is not an arXiv number
		expect(arxiv({ eprint: '4382543', eprinttype: 'pubmed' })).toBeUndefined();
	});
});

describe('sameWorkIn', () => {
	it('pairs two entries for one paper, each naming the other', () => {
		const refs = [
			ref('vaswani2017', { title: 'Attention Is All You Need', eprint: '1706.03762', eprinttype: 'arxiv' }),
			ref('attention', { title: 'Attention is all you need', journal: 'arXiv preprint arXiv:1706.03762' }),
			ref('he2016', { doi: '10.1109/CVPR.2016.90' }),
			ref('resnet', { doi: 'https://doi.org/10.1109/cvpr.2016.90' }),
			ref('devlin2019', { journal: 'arXiv preprint arXiv:1810.04805' })
		];
		const twins = sameWorkIn(refs);
		expect(twins.get('vaswani2017')).toEqual([{ key: 'attention', by: 'arxiv' }]);
		expect(twins.get('attention')).toEqual([{ key: 'vaswani2017', by: 'arxiv' }]);
		expect(twins.get('resnet')).toEqual([{ key: 'he2016', by: 'doi' }]);
		expect(twins.has('devlin2019')).toBe(false);
	});

	it('does not take a shared title or ISBN for the same work', () => {
		const refs = [
			ref('bishop-ch1', { title: 'Pattern Recognition', isbn: '978-0-387-31073-2' }, 'incollection'),
			ref('bishop-ch2', { title: 'Pattern Recognition', isbn: '978-0-387-31073-2' }, 'incollection')
		];
		expect(sameWorkIn(refs).size).toBe(0);
	});

	it('checks an entry still being typed against the saved ones', () => {
		const saved = [ref('he2016', { doi: '10.1109/CVPR.2016.90' })];
		expect(sameWorkAs(ref('new', { doi: '10.1109/cvpr.2016.90' }), saved)).toEqual([{ key: 'he2016', by: 'doi' }]);
		// the entry being edited is not its own twin
		expect(sameWorkAs(saved[0], saved)).toEqual([]);
	});
});
