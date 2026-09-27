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

	it('writes plain text for Typst, whose bib reader prints formatting commands as they stand', () => {
		const e = entryOf(workFromBibtex(MARKUP, smith, 'typst', [])!.bib);
		expect(e.title).toBe('Deep learning for in vivo imaging of {COVID-19} \\& {BERT-based} Pre-Training in {iPhone} apps: 50\\% faster');
		// biblatex's field names, which is what it reads
		expect(e.journaltitle).toBe('Journal of Imaging \\& Sensing');
		expect(e.journal).toBeUndefined();
		expect(entryOf(workFromBibtex(DATACITE, vaswani, 'typst', [])!.bib)).toMatchObject({ eprint: '1706.03762', eprinttype: 'arXiv' });
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
			for (const d of ['biblatex', 'typst'] as const) expect(problems(workFromBibtex(src, id, d, [])!.bib)).toEqual([]);
		}
	});

	it('returns null when the answer holds no entry', () => {
		expect(workFromBibtex('<html><body>Landing page</body></html>', watson, 'bibtex', [])).toBeNull();
		expect(workFromBibtex('', watson, 'bibtex', [])).toBeNull();
	});
});

// doi.org's real answers (trimmed), for the quirks the registries' BibTeX has in the wild
describe('workFromBibtex on real registry answers', () => {
	it('writes a record kept in capitals the way the names are written', () => {
		const src = ` @article{WATSON_1953, title={Molecular Structure of Nucleic Acids}, DOI={10.1038/171737a0}, journal={Nature}, author={WATSON, J. D. and CRICK, F. H. C.}, year={1953}, month=Apr, pages={737–738} }`;
		expect(entryOf(workFromBibtex(src, watson, 'bibtex', [])!.bib).author).toBe('Watson, J. D. and Crick, F. H. C.');
		const irish = ` @article{X_1, title={T}, author={O'BRIEN, J.-P. and MÜLLER, A.}, year={1990}, journal={J}}`;
		expect(entryOf(workFromBibtex(irish, smith, 'bibtex', [])!.bib).author).toBe("O'Brien, J.-P. and Müller, A.");
	});

	it('drops the empty name Crossref leaves at the end of a collaboration list', () => {
		const src = ` @article{Abbott_2016, title={Observation of Gravitational Waves from a Binary Black Hole Merger}, DOI={10.1103/physrevlett.116.061102}, journal={Physical Review Letters}, author={Abbott, B. P. and Zuraw, S. E. and Zweizig, J. and }, year={2016}, month=Feb }`;
		const e = entryOf(workFromBibtex(src, parseWorkId('10.1103/PhysRevLett.116.061102')!, 'bibtex', [])!.bib);
		expect(e.author).toBe('Abbott, B. P. and Zuraw, S. E. and Zweizig, J.');
		// DOIs ignore case, and Crossref lower-cases them: the spelling pasted is kept
		expect(e.doi).toBe('10.1103/PhysRevLett.116.061102');
	});

	it("braces DataCite's organisation authors and keys on their name", () => {
		const src = `@misc{https://doi.org/10.5281/zenodo.3509134,
  doi = {10.5281/ZENODO.3509134},
  url = {https://zenodo.org/doi/10.5281/zenodo.3509134},
  author = {The pandas development team, },
  keywords = {python, data science},
  title = {pandas-dev/pandas: Pandas},
  publisher = {Zenodo},
  year = {2026},
  copyright = {BSD 3-Clause "New" or "Revised" License}
}`;
		const w = workFromBibtex(src, parseWorkId('10.5281/zenodo.3509134')!, 'bibtex', [])!;
		expect(w.key).toBe('pandas2026pandas');
		expect(entryOf(w.bib)).toMatchObject({ author: '{The pandas development team}', doi: '10.5281/zenodo.3509134' });
	});

	it('makes an old-style arXiv paper DataCite types as an article a preprint', () => {
		const src = `@article{https://doi.org/10.48550/arxiv.hep-th/9901001,
  doi = {10.48550/ARXIV.HEP-TH/9901001},
  url = {https://arxiv.org/abs/hep-th/9901001},
  author = {Imamura, Yosuke},
  title = {String Junctions and Their Duals in Heterotic String Theory},
  publisher = {arXiv},
  year = {1999}
}`;
		const bib = workFromBibtex(src, parseWorkId('hep-th/9901001')!, 'biblatex', [])!.bib;
		expect(entryOf(bib)).toMatchObject({ entrytype: 'misc', eprint: 'hep-th/9901001', doi: '10.48550/arXiv.hep-th/9901001' });
		expect(problems(bib)).toEqual([]);
	});

	it('closes up the line break Crossref leaves after an italic span', () => {
		const src = ` @article{Wirth_2006, title={Sex and virulence in
                    <i>Escherichia coli</i>
                    : an evolutionary perspective}, DOI={10.1111/j.1365-2958.2006.05172.x}, journal={Molecular Microbiology}, author={Wirth, Thierry}, year={2006}}`;
		expect(entryOf(workFromBibtex(src, smith, 'bibtex', [])!.bib).title).toBe(
			'Sex and virulence in \\textit{Escherichia coli}: an evolutionary perspective'
		);
	});

	it("files Crossref's conference chapter where each dialect prints its book title", () => {
		const src = ` @inbook{Carion_2020, title={End-to-End Object Detection with Transformers}, ISBN={9783030584528}, DOI={10.1007/978-3-030-58452-8_13}, booktitle={Computer Vision – ECCV 2020}, publisher={Springer International Publishing}, author={Carion, Nicolas and Massa, Francisco}, year={2020}, pages={213–229} }`;
		const id = parseWorkId('10.1007/978-3-030-58452-8_13')!;
		expect(entryOf(workFromBibtex(src, id, 'bibtex', [])!.bib).entrytype).toBe('incollection');
		const modern = workFromBibtex(src, id, 'biblatex', [])!.bib;
		expect(entryOf(modern).entrytype).toBe('inbook');
		expect(problems(modern)).toEqual([]);
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
