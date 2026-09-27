// Cite by DOI: the lookup behind the dialog, and the insert once the user confirms. It lands
// where a Zotero import does - the bib the main file reads, the citation at the caret - so it
// shares that glue (lib/zotero) instead of keeping a second copy of it.
import { mainFile } from '$lib/workspace/workspaceStore';
import { references } from '$lib/workspace/citations';
import { basename, readTextFile, statFile, writeTextFile } from '$lib/workspace/fileSystem';
import { parseBibtex } from '$lib/languages/bib/biblatex';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import { appendBibEntries, translatorForSource } from '$lib/zotero/bibTarget';
import { insertCitation, mainTextOf, targetBib, type ZoteroInsertDeps } from '$lib/zotero/insertFromZotero';
import { findCited, preview, workFromBibtex, type BibDialect, type Work } from './doiEntry';
import type { WorkId } from './doiInput';

/** the insert context: the same one the Zotero picker acts on */
export type CiteDeps = ZoteroInsertDeps;

export type LookupFailure = 'not-found' | 'no-bibtex' | 'offline' | 'failed';

export type Lookup =
	/** the project already has it, under `key` */
	| ({ state: 'cited'; key: string } & Pick<Work, 'title' | 'authors' | 'venue' | 'year'>)
	/** fetched; `bibName` is the file it will be added to */
	| { state: 'found'; work: Work; fetched: string; bibName: string }
	| { state: 'error'; reason: LookupFailure; error?: string };

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
	const got = await bridge.lookup(id.doi);
	if (!got.ok) return { state: 'error', reason: got.reason, error: got.error };

	const target = await landing(main, deps);
	const cited = findCited(parseBibtex(target.text), id);
	if (cited) return { state: 'cited', key: cited.key, ...preview(cited) };
	const work = workFromBibtex(got.bibtex, id, target.dialect, takenKeys(target.text));
	if (!work) return { state: 'error', reason: 'no-bibtex' };
	return { state: 'found', work, fetched: got.bibtex, bibName: basename(target.path) };
}

/** a found work into the bib and its citation at the caret; a cited one only cited */
export async function citeWork(found: Lookup, id: WorkId, deps: CiteDeps): Promise<void> {
	if (found.state === 'cited') return insertCitation([found.key], deps.kind);
	const main = mainFile.current;
	if (found.state !== 'found' || !main) return;
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

		const name = basename(target.path);
		toaster.success({ title: m.zotero_added_one(), description: name });
		// a bib file the document never references compiles to nothing; say so once, loudly
		if (target.undeclared) {
			toaster.warning({ title: m.zotero_bib_created_title({ name }), description: m.zotero_bib_created_desc(), duration: 8000 });
		}
	} catch (e) {
		toaster.error({ title: m.cite_doi_add_failed(), description: e instanceof Error ? e.message : String(e) });
	}
}

/** the bib new entries go to, what it holds now, and which field names it is read with */
async function landing(main: string, deps: CiteDeps): Promise<{ path: string; undeclared: boolean; text: string; dialect: BibDialect }> {
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
