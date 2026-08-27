// The Zotero citation flow: search-and-pick in the in-app dialog (ZoteroCitationDialog, fed by
// Better BibTeX's item.search through the electron bridge), land the picked entries in the
// bibliography the MAIN file declares, and put the citation at the caret. Host-only by wiring -
// guests never get the action - and desktop-only by the bridge check. The landing itself (which
// bib, how to append, the caret insert) is shared with the personal-library flow and lives in
// lib/workspace/insertBibliography.ts; this file is the Zotero-specific glue: probe, search, and
// the Better BibTeX export that turns picked keys into bib text.
import { mainFile } from '$lib/workspace/workspaceStore';
import { readTextFile, samePath } from '$lib/workspace/fileSystem';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import { translatorForSource } from '$lib/workspace/bibTarget';
import { insertBibliographyEntries, type CitationInsertDeps } from '$lib/workspace/insertBibliography';
import { zoteroPicker } from './pickerState.svelte';

/** the bridge exists (desktop app); says nothing about Zotero itself being up */
export function zoteroAvailable(): boolean {
	return typeof window !== 'undefined' && !!window.texpileZotero;
}

export type ZoteroInsertDeps = CitationInsertDeps;

/** entry point: check Zotero is reachable, then hand off to the in-app picker dialog */
export async function insertCitationFromZotero(deps: ZoteroInsertDeps): Promise<void> {
	const bridge = window.texpileZotero;
	if (!bridge || !mainFile.current) return;
	const probe = await bridge.probe();
	if (!probe.running) {
		toaster.error({ title: m.zotero_not_running_title(), description: m.zotero_not_running_desc() });
		return;
	}
	if (!probe.bbt) {
		toaster.error({ title: m.zotero_bbt_missing_title(), description: m.zotero_bbt_missing_desc() });
		return;
	}
	zoteroPicker.show(deps);
}

/** the dialog confirmed a selection: entries into the bib, citation at the caret, toasts out */
export async function applyPickedCitations(keys: string[], deps: ZoteroInsertDeps): Promise<void> {
	const bridge = window.texpileZotero;
	const main = mainFile.current;
	if (!bridge || !main || !keys.length) return;
	try {
		// the main file as the user sees it, for the translator decision only; the landing helper
		// re-reads it for the bib path (the open buffer is what the scan should see in both)
		const open = deps.openDoc();
		const mainText = open.path && samePath(open.path, main) ? open.text : await readTextFile(main);

		const exported = await bridge.exportBib(keys, translatorForSource(mainText, deps.kind));
		if (!exported.ok || typeof exported.bib !== 'string') {
			toaster.error({ title: m.zotero_failed_title(), description: exported.error ?? '' });
			return;
		}

		await insertBibliographyEntries(exported.bib, keys, deps);
	} catch (e) {
		toaster.error({ title: m.zotero_failed_title(), description: e instanceof Error ? e.message : String(e) });
	}
}
