// @vitest-environment jsdom
//
// Cite by DOI end to end, with doi.org and the disk stubbed: what the dialog shows for a work,
// and what lands in the bib and at the caret when the user cites it.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const disk = new Map<string, string>();
vi.mock('$lib/workspace/fileSystem', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/workspace/fileSystem')>()),
	statFile: async (p: string) => ({ exists: disk.has(p), mtimeMs: 0, size: 0 }),
	readTextFile: async (p: string) => {
		if (!disk.has(p)) throw new Error(`ENOENT ${p}`);
		return disk.get(p)!;
	},
	writeTextFile: async (p: string, text: string) => void disk.set(p, text),
	scanFiles: async (_root: string, exts: string[]) => ({
		files: [...disk.keys()].filter((p) => exts.some((e) => p.endsWith(`.${e}`))).map((path) => ({ path }))
	})
}));

const inserted: string[][] = [];
vi.mock('$lib/zotero/insertFromZotero', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/zotero/insertFromZotero')>()),
	insertCitation: (keys: string[]) => void inserted.push(keys)
}));

const toasts: { kind: string; title: string }[] = [];
vi.mock('$lib/modals/toaster-svelte', () => ({
	toaster: Object.fromEntries(
		['success', 'info', 'warning', 'error'].map((kind) => [kind, (t: { title: string }) => toasts.push({ kind, title: t.title })])
	)
}));

import { citeWork, lookUpWork, searchPapers } from '$lib/cite/citeByDoi';
import { parseWorkId } from '$lib/cite/doiInput';
import { mainFile } from '$lib/workspace/workspaceStore';
import { references } from '$lib/workspace/citations';
import { parseBibtex } from '$lib/languages/bib/biblatex';

const CROSSREF = ` @article{Watson_1953, title={Molecular Structure of Nucleic Acids}, DOI={10.1038/171737a0}, journal={Nature}, publisher={Springer}, author={Watson, J. D. and Crick, F. H. C.}, year={1953}, pages={737–738} }`;
const MAIN = '/paper/main.tex';
const BIB = '/paper/refs.bib';
const deps = { kind: 'tex' as const, root: '/paper', openDoc: () => ({ path: MAIN, text: disk.get(MAIN) ?? '' }) };
const watson = parseWorkId('https://doi.org/10.1038/171737a0')!;

const lookup = vi.fn();
const search = vi.fn();
const isbn = vi.fn();
const pmid = vi.fn();

beforeEach(() => {
	disk.clear();
	inserted.length = 0;
	toasts.length = 0;
	lookup.mockReset().mockResolvedValue({ ok: true, bibtex: CROSSREF });
	search.mockReset();
	isbn.mockReset();
	pmid.mockReset();
	window.texpileDoi = { lookup, search, isbn, pmid };
	disk.set(MAIN, '\\documentclass{article}\n\\usepackage{biblatex}\n\\addbibresource{refs.bib}\n');
	disk.set(BIB, '@book{knuth1984texbook, title = {The TeXbook}, author = {Knuth, Donald}, year = {1984}}\n');
	mainFile.current = MAIN;
	references.current = parseBibtex(disk.get(BIB)!);
});

describe('lookUpWork', () => {
	it('previews the fetched work under the key it will get, and the bib it goes to', async () => {
		const r = await lookUpWork(watson, deps);
		expect(lookup).toHaveBeenCalledWith('10.1038/171737a0');
		expect(r).toMatchObject({
			state: 'found',
			bibName: 'refs.bib',
			work: { key: 'watson1953molecular', authors: 'Watson and Crick', year: '1953' }
		});
	});

	it('answers from the project, without the network, for a work it already cites', async () => {
		disk.set(BIB, `${disk.get(BIB)}\n@article{dna, doi = {10.1038/171737A0}, title = {Molecular Structure}, author = {Watson, J. D.}}\n`);
		expect(await lookUpWork(watson, deps)).toMatchObject({ state: 'cited', key: 'dna', title: 'Molecular Structure' });
		expect(lookup).not.toHaveBeenCalled();
	});

	it('passes a failed lookup on as it came', async () => {
		lookup.mockResolvedValue({ ok: false, reason: 'offline', error: 'net::ERR_INTERNET_DISCONNECTED' });
		expect(await lookUpWork(watson, deps)).toEqual({ state: 'error', reason: 'offline', error: 'net::ERR_INTERNET_DISCONNECTED' });
	});
});

describe('lookUpWork for books and PubMed records', () => {
	it("takes a PubMed record's entry from its DOI, and cites it under that DOI", async () => {
		pmid.mockResolvedValue({ ok: true, doi: '10.1038/171737a0' });
		const found = await lookUpWork(parseWorkId('PMID: 13054692')!, deps);
		expect(pmid).toHaveBeenCalledWith('13054692');
		expect(lookup).toHaveBeenCalledWith('10.1038/171737a0');
		expect(found).toMatchObject({ state: 'found', id: { kind: 'doi', doi: '10.1038/171737a0' }, work: { key: 'watson1953molecular' } });
		await citeWork(found, deps);
		expect(parseBibtex(disk.get(BIB)!)[1]).toMatchObject({ key: 'watson1953molecular', doi: '10.1038/171737a0' });
	});

	it('finds a PubMed record the project cites by DOI once the DOI is known', async () => {
		disk.set(BIB, `${disk.get(BIB)}\n@article{dna, doi = {10.1038/171737a0}, title = {Molecular Structure}}\n`);
		pmid.mockResolvedValue({ ok: true, doi: '10.1038/171737a0' });
		expect(await lookUpWork(parseWorkId('PMID: 13054692')!, deps)).toMatchObject({ state: 'cited', key: 'dna' });
		expect(lookup).not.toHaveBeenCalled();
	});

	it('adds a book from its ISBN', async () => {
		isbn.mockResolvedValue({
			ok: true,
			bibtex: '@book{isbn, title = {The TeXbook}, author = {Donald E. Knuth}, publisher = {Addison-Wesley}, year = {1986}}'
		});
		const found = await lookUpWork(parseWorkId('0-201-13447-0')!, deps);
		expect(isbn).toHaveBeenCalledWith('9780201134476');
		await citeWork(found, deps);
		expect(parseBibtex(disk.get(BIB)!)[1]).toMatchObject({ key: 'knuth1986texbook', entrytype: 'book', isbn: '9780201134476' });
		expect(inserted).toEqual([['knuth1986texbook']]);
	});
});

describe('searchPapers', () => {
	it('ranks what the sources found and marks the papers the project already cites', async () => {
		disk.set(BIB, `${disk.get(BIB)}\n@article{resnet, doi = {10.1109/CVPR.2016.90}}\n`);
		search.mockResolvedValue({
			ok: true,
			hits: [
				{
					doi: '10.3390/app12188972',
					title: 'Deep Residual Learning for Image Recognition: A Survey',
					authors: ['Shafiq'],
					venue: 'Applied Sciences',
					year: '2022',
					cites: 987
				},
				{
					doi: '10.1109/cvpr.2016.90',
					title: 'Deep Residual Learning for Image Recognition',
					authors: ['He'],
					venue: 'CVPR',
					year: '2016',
					cites: 175414
				}
			]
		});
		const got = await searchPapers('deep residual learning for image recognition', deps);
		expect(search).toHaveBeenCalledWith('deep residual learning for image recognition');
		expect(got.state === 'hits' && got.hits.map((h) => [h.doi, h.citedKey])).toEqual([
			['10.1109/cvpr.2016.90', 'resnet'],
			['10.3390/app12188972', undefined]
		]);
	});

	it('marks no paper cited that only a .bib the document does not read has', async () => {
		const stray = '@article{dna, doi = {10.1038/171737a0}, title = {Molecular Structure}}';
		disk.set('/paper/old/draft.bib', stray);
		references.current = [...references.current, ...parseBibtex(stray)];
		search.mockResolvedValue({
			ok: true,
			hits: [
				{
					doi: '10.1038/171737a0',
					title: 'Molecular Structure of Nucleic Acids',
					authors: ['Watson'],
					venue: 'Nature',
					year: '1953',
					cites: 1
				}
			]
		});
		const got = await searchPapers('molecular structure of nucleic acids', deps);
		expect(got.state === 'hits' && got.hits.map((h) => h.citedKey)).toEqual([undefined]);
	});

	it('passes a failed search on as it came', async () => {
		search.mockResolvedValue({ ok: false, reason: 'offline', error: 'net::ERR_INTERNET_DISCONNECTED' });
		expect(await searchPapers('anything', deps)).toEqual({ state: 'error', reason: 'offline', error: 'net::ERR_INTERNET_DISCONNECTED' });
	});
});

describe('citeWork', () => {
	it('adds the entry to the bib the main file declares, in its dialect, and cites it', async () => {
		await citeWork(await lookUpWork(watson, deps), deps);
		const refs = parseBibtex(disk.get(BIB)!);
		expect(refs.map((r) => r.key)).toEqual(['knuth1984texbook', 'watson1953molecular']);
		// \addbibresource: biblatex names, and no publisher on an article
		expect(refs[1]).toMatchObject({ journaltitle: 'Nature', pages: '737--738', doi: '10.1038/171737a0' });
		expect(refs[1].publisher).toBeUndefined();
		expect(disk.get(BIB)!.startsWith('@book{knuth1984texbook, title = {The TeXbook}')).toBe(true);
		expect(inserted).toEqual([['watson1953molecular']]);
		expect(toasts).toEqual([{ kind: 'success', title: 'Added 1 reference' }]);
	});

	it('cites the existing entry when the bib gained the work while the dialog was open', async () => {
		const found = await lookUpWork(watson, deps);
		disk.set(BIB, `${disk.get(BIB)}\n@article{crick, doi = {10.1038/171737a0}, title = {DNA}}\n`);
		const before = disk.get(BIB);
		await citeWork(found, deps);
		expect(disk.get(BIB)).toBe(before);
		expect(inserted).toEqual([['crick']]);
	});

	it('takes a fresh key when the one previewed was taken in the meantime', async () => {
		const found = await lookUpWork(watson, deps);
		disk.set(BIB, `${disk.get(BIB)}\n@misc{watson1953molecular, title = {Something else}}\n`);
		await citeWork(found, deps);
		expect(parseBibtex(disk.get(BIB)!).map((r) => r.key)).toContain('watson1953molecular2');
		expect(inserted).toEqual([['watson1953molecular2']]);
	});

	it('writes classic BibTeX names for a \\bibliography project', async () => {
		disk.set(MAIN, '\\documentclass{article}\n\\bibliography{refs}\n');
		await citeWork(await lookUpWork(watson, deps), deps);
		const added = parseBibtex(disk.get(BIB)!)[1];
		expect(added.journal).toBe('Nature');
		expect(added.journaltitle).toBeUndefined();
	});

	it("adds to the declared bib the project has, not to IEEEtran's string file listed before it", async () => {
		disk.set(MAIN, '\\documentclass{IEEEtran}\n\\begin{document}\n\\bibliography{IEEEabrv,refs}\n\\end{document}\n');
		await citeWork(await lookUpWork(watson, deps), deps);
		expect(disk.has('/paper/IEEEabrv.bib')).toBe(false);
		expect(parseBibtex(disk.get(BIB)!).map((r) => r.key)).toEqual(['knuth1984texbook', 'watson1953molecular']);
	});

	it("writes a Typst project's entry for Typst's bib reader, and cites it there", async () => {
		const MAIN_TYP = '/paper/main.typ';
		disk.set(MAIN_TYP, '= Paper\n#bibliography("refs.bib")\n');
		const typ = { kind: 'typ' as const, root: '/paper', openDoc: () => ({ path: MAIN_TYP, text: disk.get(MAIN_TYP)! }) };
		mainFile.current = MAIN_TYP;
		lookup.mockResolvedValue({ ok: true, bibtex: CROSSREF.replace('Molecular Structure', '<i>Molecular</i> Structure') });
		await citeWork(await lookUpWork(watson, typ), typ);
		const added = parseBibtex(disk.get(BIB)!)[1];
		expect(added).toMatchObject({ key: 'watson1953molecular', title: 'Molecular Structure of Nucleic Acids', journaltitle: 'Nature' });
		expect(inserted).toEqual([['watson1953molecular']]);
	});

	it('never writes BibTeX into the Hayagriva file a Typst project lists; it uses a .bib and says to list it', async () => {
		const MAIN_TYP = '/paper/main.typ';
		const YML = '/paper/refs.yml';
		const hayagriva = 'knuth84:\n  type: article\n  title: Literate Programming\n';
		disk.delete(BIB);
		disk.set(YML, hayagriva);
		disk.set(MAIN_TYP, '= Paper\n#bibliography("refs.yml")\n');
		const typ = { kind: 'typ' as const, root: '/paper', openDoc: () => ({ path: MAIN_TYP, text: disk.get(MAIN_TYP)! }) };
		mainFile.current = MAIN_TYP;
		references.current = [];
		const found = await lookUpWork(watson, typ);
		expect(found).toMatchObject({ state: 'found', bibName: 'references.bib' });
		await citeWork(found, typ);
		expect(disk.get(YML)).toBe(hayagriva);
		expect(parseBibtex(disk.get('/paper/references.bib')!)[0].key).toBe('watson1953molecular');
		expect(inserted).toEqual([['watson1953molecular']]);
		expect(toasts).toEqual([
			{ kind: 'success', title: 'Added 1 reference' },
			{ kind: 'warning', title: 'Add references.bib to your bibliography' }
		]);
	});

	it('adds to the .bib a Typst project lists beside its Hayagriva file, and to a root-relative one', async () => {
		const MAIN_TYP = '/paper/chapters/main.typ';
		disk.set('/paper/refs.yml', 'knuth84:\n  title: Literate Programming\n');
		disk.set(MAIN_TYP, '#bibliography(("/refs.yml", "/refs.bib"))\n');
		const typ = { kind: 'typ' as const, root: '/paper', openDoc: () => ({ path: MAIN_TYP, text: disk.get(MAIN_TYP)! }) };
		mainFile.current = MAIN_TYP;
		await citeWork(await lookUpWork(watson, typ), typ);
		expect(parseBibtex(disk.get(BIB)!).map((r) => r.key)).toEqual(['knuth1984texbook', 'watson1953molecular']);
		expect(toasts.map((t) => t.kind)).toEqual(['success']);
	});

	it('only cites a work the project already has', async () => {
		disk.set(BIB, `${disk.get(BIB)}\n@article{dna, doi = {10.1038/171737a0}}\n`);
		const before = disk.get(BIB);
		await citeWork(await lookUpWork(watson, deps), deps);
		expect(disk.get(BIB)).toBe(before);
		expect(inserted).toEqual([['dna']]);
		expect(toasts).toEqual([]);
	});

	it('adds a work the project has only in a .bib the document does not read', async () => {
		const stray = '@article{dna, doi = {10.1038/171737a0}, title = {Molecular Structure}}';
		disk.set('/paper/old/draft.bib', stray);
		references.current = [...references.current, ...parseBibtex(stray)];
		await citeWork(await lookUpWork(watson, deps), deps);
		expect(parseBibtex(disk.get(BIB)!).map((r) => r.key)).toEqual(['knuth1984texbook', 'watson1953molecular']);
		expect(inserted).toEqual([['watson1953molecular']]);
	});

	it('creates references.bib beside the main when the project has none, and says nothing reads it yet', async () => {
		disk.delete(BIB);
		disk.set(MAIN, '\\documentclass{article}\n');
		references.current = [];
		await citeWork(await lookUpWork(watson, deps), deps);
		expect(parseBibtex(disk.get('/paper/references.bib')!)[0].key).toBe('watson1953molecular');
		expect(toasts.map((t) => t.kind)).toEqual(['success', 'warning']);
	});
});
