import { describe, expect, it } from 'vitest';
import { findCited, workFromBibtex } from '$lib/cite/doiEntry';
import { parseWorkId, type WorkId } from '$lib/cite/doiInput';
import { parseBibtex, validateEntry, type BiblatexReference } from '$lib/languages/bib/biblatex';

// the shapes doi.org returns for application/x-bibtex: Crossref's one-line entry, DataCite's
// multi-line one with the DOI link as its key
const CROSSREF = ` @article{Watson_1953, title={Molecular Structure of Nucleic Acids: A Structure for Deoxyribose Nucleic Acid}, volume={171}, ISSN={1476-4687}, url={http://dx.doi.org/10.1038/171737a0}, DOI={10.1038/171737a0}, number={4356}, journal={Nature}, publisher={Springer Science and Business Media LLC}, author={Watson, J. D. and Crick, F. H. C.}, year={1953}, month=apr, pages={737–738} }`;
const DATACITE = `@misc{https://doi.org/10.48550/arxiv.1706.03762,
  doi = {10.48550/ARXIV.1706.03762},
  url = {https://arxiv.org/abs/1706.03762},
  author = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and Uszkoreit, Jakob and Jones, Llion and Gomez, Aidan N. and Kaiser, Lukasz and Polosukhin, Illia},
  keywords = {Computation and Language (cs.CL), Machine Learning (cs.LG), FOS: Computer and information sciences, FOS: Computer and information sciences},
  title = {Attention Is All You Need},
  publisher = {arXiv},
  year = {2017},
  copyright = {arXiv.org perpetual, non-exclusive license}
}`;
const MARKUP = `@article{Smith_2020, title={Deep learning for <i>in vivo</i> imaging of COVID-19 &amp; BERT-based Pre-Training in iPhone apps: 50% faster}, volume={12}, DOI={https://doi.org/10.1000/xyz}, journal={Journal of Imaging & Sensing}, author={M{\\"u}ller, J{\\"u}rgen and Smith, Jane}, year={2020}, pages={1-10}}`;

const watson = parseWorkId('10.1038/171737a0')!;
const vaswani = parseWorkId('arXiv:1706.03762')!;
const smith = parseWorkId('10.1000/xyz')!;

function entryOf(bib: string): BiblatexReference {
	const [e] = parseBibtex(bib);
	return e;
}

/** what the bib editor would flag on this entry */
function problems(bib: string) {
	const e = entryOf(bib);
	const fields = Object.keys(e).filter((k) => !['key', 'entrytype', 'raw', 'displayLabel', 'hasInlineComment'].includes(k));
	return validateEntry(e.entrytype, fields);
}

describe('workFromBibtex', () => {
	it('keys a Crossref entry the way Google Scholar does, and keeps only what a style prints', () => {
		const w = workFromBibtex(CROSSREF, watson, 'bibtex', [])!;
		expect(w.key).toBe('watson1953molecular');
		expect(w.bib).toBe(
			[
				'@article{watson1953molecular,',
				'    author = {Watson, J. D. and Crick, F. H. C.},',
				'    title = {Molecular Structure of Nucleic Acids: A Structure for Deoxyribose Nucleic Acid},',
				'    journal = {Nature},',
				'    volume = {171},',
				'    number = {4356},',
				'    pages = {737--738},',
				'    year = {1953},',
				'    doi = {10.1038/171737a0}',
				'}'
			].join('\n')
		);
		expect(w).toMatchObject({
			title: 'Molecular Structure of Nucleic Acids: A Structure for Deoxyribose Nucleic Acid',
			authors: 'Watson and Crick',
			venue: 'Nature',
			year: '1953'
		});
	});

	it('writes biblatex field names for a biblatex project', () => {
		const e = entryOf(workFromBibtex(CROSSREF, watson, 'biblatex', [])!.bib);
		expect(e.journaltitle).toBe('Nature');
		expect(e.journal).toBeUndefined();
	});

	it('gives an arXiv paper a real key and the eprint fields each dialect prints', () => {
		const classic = workFromBibtex(DATACITE, vaswani, 'bibtex', [])!;
		expect(classic.key).toBe('vaswani2017attention');
		const c = entryOf(classic.bib);
		expect(c).toMatchObject({
			entrytype: 'misc',
			doi: '10.48550/arXiv.1706.03762',
			eprint: '1706.03762',
			archiveprefix: 'arXiv',
			howpublished: 'arXiv preprint arXiv:1706.03762',
			url: 'https://arxiv.org/abs/1706.03762'
		});
		expect(c.keywords).toBeUndefined();
		expect(c.copyright).toBeUndefined();
		expect(classic).toMatchObject({ authors: 'Vaswani et al.', venue: 'arXiv:1706.03762', year: '2017' });

		const modern = entryOf(workFromBibtex(DATACITE, vaswani, 'biblatex', [])!.bib);
		expect(modern).toMatchObject({ eprint: '1706.03762', eprinttype: 'arXiv' });
		expect(modern.archiveprefix).toBeUndefined();
		expect(modern.howpublished).toBeUndefined();
	});

	it('turns registry markup into LaTeX and escapes what LaTeX would read as syntax', () => {
		const e = entryOf(workFromBibtex(MARKUP, smith, 'bibtex', [])!.bib);
		expect(e.title).toBe(
			'Deep learning for \\textit{in vivo} imaging of {COVID-19} \\& {BERT-based} Pre-Training in {iPhone} apps: 50\\% faster'
		);
		expect(e.journal).toBe('Journal of Imaging \\& Sensing');
		expect(e.doi).toBe('10.1000/xyz');
		expect(e.pages).toBe('1--10');
	});

	it('leaves a title the registry already protected as it is', () => {
		const src = '@article{X_1, title={The {ATLAS} Detector and BERT}, author={Aad, G.}, year={2008}, journal={JINST}}';
		expect(entryOf(workFromBibtex(src, smith, 'bibtex', [])!.bib).title).toBe('The {ATLAS} Detector and BERT');
	});

	it('keys on the ASCII form of an accented surname', () => {
		expect(workFromBibtex(MARKUP, smith, 'bibtex', [])!.key).toBe('muller2020deep');
		const plain = '@article{X, title={Über alles}, author={Müller, Jürgen}, year={2021}, journal={J}}';
		expect(workFromBibtex(plain, smith, 'bibtex', [])!.key).toBe('muller2021uber');
	});

	it("keys an organisation on its name's first significant word", () => {
		const src =
			'@article{X, title={Observation of Gravitational Waves}, author={{The LIGO Scientific Collaboration} and Abbott, B. P.}, year={2016}, journal={PRL}}';
		expect(workFromBibtex(src, smith, 'bibtex', [])!.key).toBe('ligo2016observation');
	});

	it('steps around keys the project already has, whatever their case', () => {
		expect(workFromBibtex(CROSSREF, watson, 'bibtex', ['watson1953molecular'])!.key).toBe('watson1953molecular2');
		expect(workFromBibtex(CROSSREF, watson, 'bibtex', ['Watson1953Molecular', 'watson1953molecular2'])!.key).toBe('watson1953molecular3');
	});

	it('produces entries the bib editor has nothing to flag on', () => {
		for (const [src, id] of [
			[CROSSREF, watson],
			[DATACITE, vaswani],
			[MARKUP, smith]
		] as [string, WorkId][]) {
			expect(problems(workFromBibtex(src, id, 'biblatex', [])!.bib)).toEqual([]);
		}
	});

	it('returns null when the answer holds no entry', () => {
		expect(workFromBibtex('<html><body>Landing page</body></html>', watson, 'bibtex', [])).toBeNull();
		expect(workFromBibtex('', watson, 'bibtex', [])).toBeNull();
	});
});

describe('findCited', () => {
	const refs = parseBibtex(
		[
			'@article{dna, doi = {https://doi.org/10.1038/171737A0}, title = {Molecular Structure}}',
			'@misc{transformer, eprint = {arXiv:1706.03762v5}, title = {Attention}}',
			'@misc{bert, url = {https://arxiv.org/abs/1810.04805v2}, title = {BERT}}'
		].join('\n\n')
	);

	it('matches a DOI however the entry spells it', () => {
		expect(findCited(refs, watson)?.key).toBe('dna');
	});

	it('matches an arXiv paper on its eprint number or its abs link', () => {
		expect(findCited(refs, vaswani)?.key).toBe('transformer');
		expect(findCited(refs, parseWorkId('1810.04805')!)?.key).toBe('bert');
	});

	it('finds nothing for a work the project does not cite', () => {
		expect(findCited(refs, smith)).toBeNull();
		expect(findCited(refs, parseWorkId('2101.00001')!)).toBeNull();
	});
});
