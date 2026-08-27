// Land bib entries into the project's bibliography and put citations at the caret: the shared
// back half of the Zotero and personal-library flows. Zotero supplies entries via Better BibTeX's
// export, the library supplies them from its own store; everything after that - resolve the .bib
// the main file declares, append what is missing, toast, cite - is the same. The toast messages
// are shared too: the zotero_* keys they read say nothing Zotero-specific ("Added 1 reference",
// "Created refs.bib").
import type { Node as PMNode } from 'prosemirror-model';
import { editorViewStore, sourceCmView } from '$lib/stores/editorStore';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { mainFile } from '$lib/workspace/workspaceStore';
import { readTextFile, writeTextFile, statFile, scanFiles, joinPath, dirname, basename, samePath } from '$lib/workspace/fileSystem';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import { bibPathFromSource, appendBibEntries, citationTextFor } from '$lib/workspace/bibTarget';

export type CitationInsertDeps = {
	/** 'tex' or 'typ': the dialect of the open file (the gate ensures it matches the main's) */
	kind: 'tex' | 'typ';
	/** the workspace root, for finding stray .bib files when the main declares none */
	root: string;
	/** the OPEN document, so an unsaved main is scanned as the user sees it, not as disk has it */
	openDoc(): { path: string | null; text: string };
};

export type BibliographyLanding = {
	/** keys appended to the project's .bib */
	added: string[];
	/** keys skipped because the .bib already has them */
	skipped: string[];
	/** a .bib was created that the main file does not reference yet */
	undeclared: boolean;
};

/**
 * Append `bibText`'s entries (deduped by key) to the bibliography the main file declares, put a
 * citation at the caret for `keys`, and report the outcome through toasts. Resolves the target
 * exactly as applyPickedCitations did: declared path first, then a stray .bib, then a new
 * references.bib next to the main file.
 */
export async function insertBibliographyEntries(bibText: string, keys: string[], deps: CitationInsertDeps): Promise<BibliographyLanding> {
	const main = mainFile.current;
	if (!main || !keys.length) return { added: [], skipped: [], undeclared: false };
	try {
		// the main file as the user sees it: the open buffer when the main IS the open file
		const open = deps.openDoc();
		const mainText = open.path && samePath(open.path, main) ? open.text : await readTextFile(main);

		const declaredRel = bibPathFromSource(mainText, deps.kind);
		let bibPath: string;
		let undeclared = false;
		if (declaredRel) {
			// resolved against the main file's folder: latexmk compiles with -cd, and Typst
			// resolves #bibliography against the file that calls it
			bibPath = joinPath(dirname(main), declaredRel);
		} else {
			const found = (await scanFiles(deps.root, ['bib'])).files;
			const preferred = found.find((f) => basename(f.path).toLowerCase() === 'references.bib') ?? found[0];
			if (preferred) {
				bibPath = preferred.path;
			} else {
				bibPath = joinPath(dirname(main), 'references.bib');
				undeclared = true;
			}
		}

		const existing = (await statFile(bibPath)).exists ? await readTextFile(bibPath) : '';
		const merged = appendBibEntries(existing, bibText);
		if (merged.added.length) await writeTextFile(bibPath, merged.text);

		insertCitationAtCaret(keys, deps.kind);

		const name = basename(bibPath);
		if (merged.added.length) {
			toaster.success({
				title: merged.added.length === 1 ? m.zotero_added_one() : m.zotero_added_other({ count: merged.added.length }),
				description: name
			});
		} else {
			toaster.info({ title: m.zotero_none_new_title(), description: name });
		}
		// a bib file the document never references compiles to nothing; say so once, loudly
		if (undeclared) {
			toaster.warning({
				title: m.zotero_bib_created_title({ name }),
				description: m.zotero_bib_created_desc(),
				duration: 8000
			});
		}
		return { added: merged.added, skipped: merged.skipped, undeclared };
	} catch (e) {
		toaster.error({ title: m.citations_insert_failed(), description: e instanceof Error ? e.message : String(e) });
		return { added: [], skipped: [], undeclared: false };
	}
}

/** citation at the caret: a node in the visual editor when its schema has one, text in source */
export function insertCitationAtCaret(keys: string[], kind: 'tex' | 'typ'): void {
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
