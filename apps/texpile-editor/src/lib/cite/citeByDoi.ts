// cite by DOI: the dialog's lookups, and the insert through the Zotero import's glue (lib/zotero)
import { mainFile } from '$lib/workspace/workspaceStore';
import { references } from '$lib/workspace/citations';
import { basename, readTextFile, statFile, writeTextFile } from '$lib/workspace/fileSystem';
import { parseBibtex } from '$lib/languages/bib/biblatex';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import { appendBibEntries, translatorForSource } from '$lib/zotero/bibTarget';
import { insertCitation, mainTextOf, targetBib, warnUndeclared, type BibTarget, type ZoteroInsertDeps } from '$lib/zotero/insertFromZotero';
import { findCited, preview, workFromBibtex, type BibDialect, type Work } from './doiEntry';
import { parseWorkId, type WorkId } from './doiInput';
import { rankHits, type SearchHit } from './searchRank';

/** the insert context: the same one the Zotero picker acts on */
export type CiteDeps = ZoteroInsertDeps;

export type LookupFailure = 'not-found' | 'no-bibtex' | 'offline' | 'failed';

export type Lookup =
	/** the project already has it, under `key` */
	| ({ state: 'cited'; key: string } & Pick<Work, 'title' | 'authors' | 'venue' | 'year'>)
	/** `bibName`: the file it will be added to; `id` is a PubMed ID's DOI when it has one */
	| { state: 'found'; work: Work; fetched: string; bibName: string; id: WorkId }
	| { state: 'error'; reason: LookupFailure; error?: string };

export type Hit = SearchHit & { citedKey?: string };

export type Search = { state: 'hits'; hits: Hit[] } | { state: 'error'; reason: 'offline' | 'failed'; error?: string };

/** the bridge exists (desktop app); says nothing about the network */
export function doiLookupAvailable(): boolean {
	return typeof window !== 'undefined' && !!window.texpileDoi;
}

export async function lookUpWork(id: WorkId, deps: CiteDeps): Promise<Lookup> {
	// most pastes are of a paper the project already cites; those need no network at all
	const known = findCited(references.current, id);
	if (known) return { state: 'cited', key: known.key, ...preview(known) };

	const bridge = window.texpileDoi;
	const main = mainFile.current;
	if (!bridge || !main) return { state: 'error', reason: 'failed' };
	const got =
		id.kind === 'isbn' ? await bridge.isbn(id.isbn) : id.kind === 'pmid' ? await bridge.pmid(id.pmid) : await bridge.lookup(id.doi);
	if (!got.ok) return { state: 'error', reason: got.reason, error: got.error };
	// a PubMed record with a DOI: its entry is the publisher's, through doi.org
	if ('doi' in got) return lookUpWork(parseWorkId(got.doi) ?? { kind: 'doi', doi: got.doi }, deps);

	const target = await landing(main, deps);
	const cited = findCited(parseBibtex(target.text), id);
	if (cited) return { state: 'cited', key: cited.key, ...preview(cited) };
	const work = workFromBibtex(got.bibtex, id, target.dialect, takenKeys(target.text));
	if (!work) return { state: 'error', reason: 'no-bibtex' };
	return { state: 'found', work, fetched: got.bibtex, bibName: basename(target.path), id };
}

export async function searchPapers(query: string): Promise<Search> {
	const bridge = window.texpileDoi;
	if (!bridge) return { state: 'error', reason: 'failed' };
	const got = await bridge.search(query);
	if (!got.ok) return { state: 'error', reason: got.reason, error: got.error };
	return {
		state: 'hits',
		hits: rankHits(query, got.hits).map((hit) => {
			const id = parseWorkId(hit.doi);
			const known = id ? findCited(references.current, id) : null;
			return known ? { ...hit, citedKey: known.key } : hit;
		})
	};
}

/** a found work into the bib and its citation at the caret; a cited one only cited */
export async function citeWork(found: Lookup, deps: CiteDeps): Promise<void> {
	if (found.state === 'cited') return insertCitation([found.key], deps.kind);
	const main = mainFile.current;
	if (found.state !== 'found' || !main) return;
	const { id } = found;
	try {
		// read again: the bib can change while the dialog is open, and the key must still be free
		const target = await landing(main, deps);
		const cited = findCited(parseBibtex(target.text), id);
		if (cited) return insertCitation([cited.key], deps.kind);
		const work = workFromBibtex(found.fetched, id, target.dialect, takenKeys(target.text)) ?? found.work;
		await writeTextFile(target.path, appendBibEntries(target.text, work.bib).text);
		// our own write: the references (and the tree, for a new bib) refresh now, not at the watcher's
		// debounce, so the citation below does not draw as a missing key first
		dispatchEvent(new CustomEvent('texpile:fs-changed'));
		insertCitation([work.key], deps.kind);

		toaster.success({ title: m.zotero_added_one(), description: basename(target.path) });
		if (target.undeclared) warnUndeclared(target);
	} catch (e) {
		toaster.error({ title: m.cite_doi_add_failed(), description: e instanceof Error ? e.message : String(e) });
	}
}

/** the bib new entries go to, what it holds now, and which field names it is read with */
async function landing(main: string, deps: CiteDeps): Promise<BibTarget & { text: string; dialect: BibDialect }> {
	const mainText = await mainTextOf(main, deps);
	const target = await targetBib(main, mainText, deps);
	const text = (await statFile(target.path)).exists ? await readTextFile(target.path) : '';
	// Typst's own reader; else the same reading the Zotero export makes of the preamble
	const dialect = deps.kind === 'typ' ? 'typst' : translatorForSource(mainText, deps.kind) === 'Better BibLaTeX' ? 'biblatex' : 'bibtex';
	return { ...target, text, dialect };
}

function takenKeys(bibText: string): string[] {
	return [...references.current.map((r) => r.key), ...parseBibtex(bibText).map((r) => r.key)];
}
