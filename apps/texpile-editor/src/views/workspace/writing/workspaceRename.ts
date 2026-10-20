// renaming a label, citation key or glossary entry from the source editor: its definition and every use in the document
import { toaster } from '$lib/modals/toaster-svelte';
import type * as Y from 'yjs';
import { renameEverywhere } from '$lib/stores/editorStore';
import { ownStep, type LinkedStep } from '$lib/buffers/fileUndo';
import type { FileHistory, HistoryEntry } from '$lib/workspace/fileHistory.svelte';
import { m } from '$lib/paraglide/messages';
import { dirname, joinPath, samePath } from '$lib/workspace/fileSystem';
import { namesTried, fileCallsIn } from '$lib/languages/latex/knowledge/calls/fileCommands';
import { loadedReadings } from '$lib/languages/latex/knowledge/calls/loadedReadings';
import { documentPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { codeOnly } from '$lib/languages/latex/texCode';
import { readFirst } from '$lib/workspace/document/texIncludes';
import { definedNamesIn, renameProblemText } from '$lib/workspace/edits/renameNames';
import { renameBibSpec, renameSpec, useLanguageOf, wrapperReadingsIn, type UseKind } from '$lib/workspace/edits/renameUses';
import { replaceEdits, replaceInFiles } from '$lib/search/replaceInFiles';
import {
	attempt,
	count,
	filesText,
	makeRenameElsewhere,
	renameScope,
	replaceDeps,
	report,
	type RenameElsewhereDeps
} from './workspaceReplace';

export type SymbolRenameDeps = RenameElsewhereDeps & {
	/** the other files of the project are the host's to write */
	elsewhere: () => boolean;
	/** the open file's history, which Ctrl+Z steps in either editor */
	undoOf: (path: string) => Y.UndoManager | null;
};

type ScopeFile = { path: string; text: string };

/** the .bib files the document's bibliography commands name, found where TeX looks */
async function bibFilesOf(tex: ScopeFile[], d: SymbolRenameDeps, root: string): Promise<ScopeFile[]> {
	const found: ScopeFile[] = [];
	const main = d.main();
	for (const file of tex) {
		const bases = [dirname(file.path), ...(main ? [dirname(main)] : []), root];
		for (const call of fileCallsIn(codeOnly(file.text), ['bibfile'])) {
			for (const a of call.args) {
				for (const v of a.values) {
					const paths = namesTried(a.arg, v.value).flatMap((name) => bases.map((base) => joinPath(base, name)));
					const bib = await readFirst(paths, (p) => d.provider().readText(p));
					if (bib && !found.some((f) => samePath(f.path, bib.path))) found.push(bib);
				}
			}
		}
	}
	return found;
}

/** the files of the document the open file belongs to, and for a citation key the .bib files and every document naming one of them */
async function scopeOf(kind: UseKind, d: SymbolRenameDeps, root: string, open: string): Promise<ScopeFile[]> {
	async function read(paths: string[]): Promise<ScopeFile[]> {
		return Promise.all(
			paths.map(async (path) => ({
				path,
				text: samePath(path, open)
					? d.doc.buffer
					: await d
							.provider()
							.readText(path)
							.catch(() => '')
			}))
		);
	}
	const own = await renameScope('label', d, root);
	if (!own.some((p) => samePath(p, open))) own.unshift(open);
	const tex = await read(own);
	if (kind !== 'cite') return tex;
	const bibs = await bibFilesOf(tex, d, root);
	if (!d.elsewhere()) return [...tex, ...bibs];
	const sharing = await Promise.all(bibs.map((bib) => renameScope('cite', d, root, bib.path)));
	const more = [...new Set(sharing.flat())].filter((p) => useLanguageOf(p) && !own.some((o) => samePath(o, p)));
	return [...tex, ...(await read(more)), ...bibs];
}

export function makeRenameEverywhere(d: SymbolRenameDeps): (kind: UseKind, from: string, to: string) => Promise<void> {
	const deps = replaceDeps(d);
	return async (kind, from, to) => {
		const root = d.root();
		const open = d.doc.path;
		if (!root || !open || !from || from === to) return;
		const problem = renameProblemText(kind, to);
		if (problem) {
			toaster.error({ title: problem });
			return;
		}
		const files = await scopeOf(kind, d, root, open);
		const loaded = await documentPackages(d.doc.buffer);
		const wrappers = wrapperReadingsIn(files.filter((f) => useLanguageOf(f.path) === 'latex').map((f) => f.text));
		if (definedNamesIn(kind, files, loaded, wrappers).has(to)) {
			toaster.error({ title: m.rename_symbol_taken({ name: to }) });
			return;
		}
		const own = { ...(kind === 'glossary' ? loadedReadings(loaded, ['glossary', 'acronym']) : {}), ...wrappers };
		function specFor(path: string) {
			if (/\.bib$/i.test(path)) return kind === 'cite' ? renameBibSpec(from, to) : null;
			return useLanguageOf(path) === 'latex' ? renameSpec(kind, from, to, 'latex', own, { definitions: true, loaded }) : null;
		}
		// a guest writes the open file only; the same name left in another file would break
		const host = d.elsewhere();
		const outside = files.filter((f) => !samePath(f.path, open));
		const usedOutside = outside.some((f) => {
			const spec = specFor(f.path);
			return !!spec && replaceEdits(f.text, spec).length > 0;
		});
		if (!host && usedOutside) {
			toaster.error({ title: m.rename_symbol_guest({ name: from }) });
			return;
		}
		const scope = (host ? files : files.filter((f) => samePath(f.path, open))).map((f) => f.path);
		function change() {
			return attempt(() => replaceInFiles(scope, specFor, deps));
		}
		const um = d.undoOf(open);
		const { result: out, link } = um ? await ownStep(um, change) : { result: await change(), link: null };
		if (!out) return;
		const history = d.history();
		const entry = report(out, history, {
			title: m.rename_symbol_done({
				uses: count(out.matches, m.rename_symbol_uses_one, m.rename_symbol_uses_other),
				files: filesText(out.files)
			}),
			label: m.filehistory_op_rename_symbol({ from, to }),
			nothing: m.typst_rename_nothing()
		});
		if (history && um && entry && link && out.files > 1) link(followInOtherFiles(history, um, entry));
	};
}

// the open file steps first; when the other files cannot follow, it steps back, so the files never disagree. A redo
// pressed while the undo still writes waits for it
function followInOtherFiles(history: FileHistory, um: Y.UndoManager, entry: HistoryEntry): LinkedStep {
	let pending = Promise.resolve();
	function follow(dir: 'undo' | 'redo') {
		pending = pending.then(async () => {
			const stack = dir === 'undo' ? history.undoStack : history.redoStack;
			if (stack.at(-1)?.[dir] !== entry[dir] || (await history[dir]())) return;
			if (dir === 'undo') um.redo();
			else um.undo();
		});
	}
	return { undo: () => follow('undo'), redo: () => follow('redo') };
}

/** renames made elsewhere follow into the other files, and the source editor's rename command reaches the workspace, for as
 * long as it is mounted */
export function bindRenames(d: SymbolRenameDeps): () => void {
	const renameElsewhere = makeRenameElsewhere(d);
	const rename = makeRenameEverywhere(d);
	renameEverywhere.current = rename;
	function follow(kind: 'label' | 'cite') {
		return (e: Event) => {
			const { from, to } = (e as CustomEvent<{ from: string; to: string }>).detail;
			// the other files are the host's to write; a guest's rename stays in the file it made it in
			if (d.elsewhere()) renameElsewhere(kind, from, to);
		};
	}
	const onLabel = follow('label');
	const onCite = follow('cite');
	addEventListener('texpile:label-renamed', onLabel);
	addEventListener('texpile:citekey-renamed', onCite);
	return () => {
		if (renameEverywhere.current === rename) renameEverywhere.current = null;
		removeEventListener('texpile:label-renamed', onLabel);
		removeEventListener('texpile:citekey-renamed', onCite);
	};
}
