// The Zotero citation flow: search-and-pick in the in-app dialog (ZoteroCitationDialog, fed by
// Better BibTeX's item.search through the electron bridge), land the picked entries in the
// bibliography the MAIN file declares, and put the citation at the caret. Host-only by wiring -
// guests never get the action - and desktop-only by the bridge check. The pure text decisions
// (which bib, which translator, how to append) live in bibTarget.ts; this file is the glue
// between picker, disk and editor.
import type { Node as PMNode } from 'prosemirror-model';
import { editorViewStore, sourceCmView } from '$lib/stores/editorStore';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { mainFile } from '$lib/workspace/workspaceStore';
import { readTextFile, writeTextFile, statFile, scanFiles, joinPath, dirname, basename, samePath } from '$lib/workspace/fileSystem';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import { bibPathFromSource, translatorForSource, appendBibEntries, citationTextFor } from './bibTarget';
import { typstBibliographyPaths } from '$lib/languages/typst/bibliographyPaths';
import { zoteroPicker } from './pickerState.svelte';

/** the bridge exists (desktop app); says nothing about Zotero itself being up */
export function zoteroAvailable(): boolean {
	return typeof window !== 'undefined' && !!window.texpileZotero;
}

export type ZoteroInsertDeps = {
	/** 'tex' or 'typ': the dialect of the open file (the gate ensures it matches the main's) */
	kind: 'tex' | 'typ';
	/** the workspace root, for finding stray .bib files when the main declares none */
	root: string;
	/** the OPEN document, so an unsaved main is scanned as the user sees it, not as disk has it */
	openDoc(): { path: string | null; text: string };
};

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
		const mainText = await mainTextOf(main, deps);
		const target = await targetBib(main, mainText, deps);
		const bibPath = target.path;

		const exported = await bridge.exportBib(keys, translatorForSource(mainText, deps.kind));
		if (!exported.ok || typeof exported.bib !== 'string') {
			toaster.error({ title: m.zotero_failed_title(), description: exported.error ?? '' });
			return;
		}

		const existing = (await statFile(bibPath)).exists ? await readTextFile(bibPath) : '';
		const merged = appendBibEntries(existing, exported.bib);
		if (merged.added.length) {
			await writeTextFile(bibPath, merged.text);
			// our own write: refresh the references now, so the citation below resolves at once
			dispatchEvent(new CustomEvent('texpile:fs-changed'));
		}

		insertCitation(keys, deps.kind);

		const name = basename(bibPath);
		if (merged.added.length) {
			toaster.success({
				title: merged.added.length === 1 ? m.zotero_added_one() : m.zotero_added_other({ count: merged.added.length }),
				description: name
			});
		} else {
			toaster.info({ title: m.zotero_none_new_title(), description: name });
		}
		if (target.undeclared) warnUndeclared(target);
	} catch (e) {
		toaster.error({ title: m.zotero_failed_title(), description: e instanceof Error ? e.message : String(e) });
	}
}

/** the main file as the user sees it: the open buffer when the main IS the open file */
export async function mainTextOf(main: string, deps: ZoteroInsertDeps): Promise<string> {
	const open = deps.openDoc();
	return open.path && samePath(open.path, main) ? open.text : await readTextFile(main);
}

export type BibTarget = {
	path: string;
	/** the main file reads no bibliography from this file yet, so what lands there compiles to nothing */
	undeclared: boolean;
	/** the Hayagriva file a Typst main lists instead, when that is why the target is undeclared */
	hayagriva?: string;
};

/**
 * Where new entries land: the bib the main file declares, else the project's references.bib or
 * first .bib, else a new references.bib beside the main - `undeclared`, since nothing reads it yet.
 *
 * A Typst main that lists only Hayagriva `.yml` files gets a `.bib` all the same: the entries are
 * BibTeX, and appended to a `.yml` they would break it. That `.bib` is undeclared until the user
 * adds it to the `#bibliography` list.
 */
export async function targetBib(main: string, mainText: string, deps: ZoteroInsertDeps): Promise<BibTarget> {
	const declaredRel = bibPathFromSource(mainText, deps.kind);
	// resolved against the main file's folder: latexmk compiles with -cd, and Typst resolves
	// #bibliography against the file that calls it (and a leading / against the project root)
	if (declaredRel) {
		const rootRelative = deps.kind === 'typ' && declaredRel.startsWith('/');
		return { path: rootRelative ? joinPath(deps.root, declaredRel.slice(1)) : joinPath(dirname(main), declaredRel), undeclared: false };
	}
	const hayagriva = deps.kind === 'typ' ? typstBibliographyPaths(mainText)[0] : undefined;
	const found = (await scanFiles(deps.root, ['bib'])).files;
	const preferred = found.find((f) => basename(f.path).toLowerCase() === 'references.bib') ?? found[0];
	if (preferred) return { path: preferred.path, undeclared: !!hayagriva, hayagriva };
	return { path: joinPath(dirname(main), 'references.bib'), undeclared: true, hayagriva };
}

/** a bib file the document never references compiles to nothing; say so once, loudly */
export function warnUndeclared(target: BibTarget): void {
	const name = basename(target.path);
	if (target.hayagriva) {
		const yml = basename(target.hayagriva);
		toaster.warning({
			title: m.zotero_bib_beside_yml_title({ name }),
			description: m.zotero_bib_beside_yml_desc({ name, yml }),
			duration: 8000
		});
		return;
	}
	toaster.warning({ title: m.zotero_bib_created_title({ name }), description: m.zotero_bib_created_desc(), duration: 8000 });
}

/** citation at the caret: a node in the visual editor when its schema has one, text in source */
export function insertCitation(keys: string[], kind: 'tex' | 'typ'): void {
	const v = editorViewStore.current;
	if (v?.dom.isConnected) {
		// branch off the MOUNTED schema, never the file extension (see referenceManagerPlugin)
		if (kind === 'typ' && v.state.schema === typSchema) {
			const nodes: PMNode[] = [];
			keys.forEach((k, i) => {
				if (i) nodes.push(v.state.schema.text(' '));
				nodes.push(typSchema.nodes.typ_ref.create({ target: k }));
			});
			const { from, to } = v.state.selection;
			v.dispatch(v.state.tr.replaceWith(from, to, nodes).scrollIntoView());
			v.focus();
			return;
		}
		const cite = kind === 'tex' ? v.state.schema.nodes.citation : undefined;
		if (cite) {
			const node = cite.create({ prenote: '', postnote: '', variant: 'autocite' }, v.state.schema.text(keys.join(',')));
			v.dispatch(v.state.tr.replaceSelectionWith(node).scrollIntoView());
			v.focus();
			return;
		}
	}
	const cm = sourceCmView.current;
	if (!cm || !cm.dom.isConnected) return;
	const insert = citationTextFor(keys, kind);
	const { from, to } = cm.state.selection.main;
	cm.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length }, scrollIntoView: true });
	cm.focus();
}
