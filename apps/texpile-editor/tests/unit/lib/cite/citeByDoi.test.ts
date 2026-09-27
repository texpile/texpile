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

import { citeWork, lookUpWork } from '$lib/cite/citeByDoi';
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

beforeEach(() => {
	disk.clear();
	inserted.length = 0;
	toasts.length = 0;
	lookup.mockReset().mockResolvedValue({ ok: true, bibtex: CROSSREF });
	window.texpileDoi = { lookup };
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
		references.current = parseBibtex('@article{dna, doi = {10.1038/171737A0}, title = {Molecular Structure}, author = {Watson, J. D.}}');
		expect(await lookUpWork(watson, deps)).toMatchObject({ state: 'cited', key: 'dna', title: 'Molecular Structure' });
		expect(lookup).not.toHaveBeenCalled();
	});

	it('passes a failed lookup on as it came', async () => {
		lookup.mockResolvedValue({ ok: false, reason: 'offline', error: 'net::ERR_INTERNET_DISCONNECTED' });
		expect(await lookUpWork(watson, deps)).toEqual({ state: 'error', reason: 'offline', error: 'net::ERR_INTERNET_DISCONNECTED' });
	});
});

describe('citeWork', () => {
	it('adds the entry to the bib the main file declares, in its dialect, and cites it', async () => {
		await citeWork(await lookUpWork(watson, deps), watson, deps);
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
		await citeWork(found, watson, deps);
		expect(disk.get(BIB)).toBe(before);
		expect(inserted).toEqual([['crick']]);
	});

	it('takes a fresh key when the one previewed was taken in the meantime', async () => {
		const found = await lookUpWork(watson, deps);
		disk.set(BIB, `${disk.get(BIB)}\n@misc{watson1953molecular, title = {Something else}}\n`);
		await citeWork(found, watson, deps);
		expect(parseBibtex(disk.get(BIB)!).map((r) => r.key)).toContain('watson1953molecular2');
		expect(inserted).toEqual([['watson1953molecular2']]);
	});

	it('writes classic BibTeX names for a \\bibliography project', async () => {
		disk.set(MAIN, '\\documentclass{article}\n\\bibliography{refs}\n');
		await citeWork(await lookUpWork(watson, deps), watson, deps);
		const added = parseBibtex(disk.get(BIB)!)[1];
		expect(added.journal).toBe('Nature');
		expect(added.journaltitle).toBeUndefined();
	});

	it("writes a Typst project's entry for Typst's bib reader, and cites it there", async () => {
		const MAIN_TYP = '/paper/main.typ';
		disk.set(MAIN_TYP, '= Paper\n#bibliography("refs.bib")\n');
		const typ = { kind: 'typ' as const, root: '/paper', openDoc: () => ({ path: MAIN_TYP, text: disk.get(MAIN_TYP)! }) };
		mainFile.current = MAIN_TYP;
		lookup.mockResolvedValue({ ok: true, bibtex: CROSSREF.replace('Molecular Structure', '<i>Molecular</i> Structure') });
		await citeWork(await lookUpWork(watson, typ), watson, typ);
		const added = parseBibtex(disk.get(BIB)!)[1];
		expect(added).toMatchObject({ key: 'watson1953molecular', title: 'Molecular Structure of Nucleic Acids', journaltitle: 'Nature' });
		expect(inserted).toEqual([['watson1953molecular']]);
	});

	it('only cites a work the project already has', async () => {
		references.current = parseBibtex('@article{dna, doi = {10.1038/171737a0}}');
		const before = disk.get(BIB);
		await citeWork(await lookUpWork(watson, deps), watson, deps);
		expect(disk.get(BIB)).toBe(before);
		expect(inserted).toEqual([['dna']]);
		expect(toasts).toEqual([]);
	});

	it('creates references.bib beside the main when the project has none, and says nothing reads it yet', async () => {
		disk.delete(BIB);
		disk.set(MAIN, '\\documentclass{article}\n');
		references.current = [];
		await citeWork(await lookUpWork(watson, deps), watson, deps);
		expect(parseBibtex(disk.get('/paper/references.bib')!)[0].key).toBe('watson1953molecular');
		expect(toasts.map((t) => t.kind)).toEqual(['success', 'warning']);
	});
});
