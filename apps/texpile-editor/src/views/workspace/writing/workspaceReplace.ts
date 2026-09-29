// replace across the folder and renames followed into other files, wired to the workspace
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import { activeCompare, isDirty } from '$lib/workspace/workspaceStore';
import { basename, fromLf, samePath, type SearchFileResult } from '$lib/workspace/fileSystem';
import { documentAround, namesBibliography, type DocFile } from '$lib/workspace/document/documentFiles';
import { sourceEncodingError } from '$lib/workspace/sourceEncoding';
import { editOpenFile } from '$lib/workspace/edits/openEditorEdit';
import { editVisualText } from '$lib/workspace/edits/visualSourcePatch';
import { editorViewStore } from '$lib/stores/editorStore';
import { renameSpec, useLanguageOf, usePattern, type UseKind, type UseLanguage } from '$lib/workspace/edits/renameUses';
import { ChangedSinceError, replaceInFiles, type ReplaceDeps, type ReplaceOutcome, type ReplaceSpec } from '$lib/search/replaceInFiles';
import { hasVisualMode, type DocumentBuffer, type FileKind } from '$lib/workspace/documentBuffer.svelte';
import type { TextEdit } from '$lib/workspace/edits/textEdits';
import type { ViewModeSwitch } from '$lib/workspace/viewModeSwitch.svelte';
import type { ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
import type { SavePipeline } from '$lib/workspace/savePipeline.svelte';
import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';
import type { FileHistory } from '$lib/workspace/fileHistory.svelte';

export type FolderReplaceDeps = {
	provider: () => WorkspaceProvider;
	doc: DocumentBuffer;
	modes: ViewModeSwitch;
	kind: () => FileKind;
	parseVisual: (text: string) => Promise<ParsedLatexFile | null>;
	saver: () => SavePipeline;
	/** the tree's undo history, or null where nothing can be undone (no trash, a guest) */
	history: () => FileHistory | null;
	reloadOpen: () => Promise<void>;
	/** carry comments and suggestions through a change to a file that is not open */
	editedClosed?: ReplaceDeps['edited'];
	/** carry comments through a change to the open file in the visual editor */
	editedOpenVisual?: (before: string, after: string, edits: readonly TextEdit[]) => Promise<void>;
};

function replaceDeps(d: FolderReplaceDeps): ReplaceDeps {
	return {
		open: () => (d.doc.path ? { path: d.doc.path, text: d.doc.buffer, eol: d.doc.eol } : null),
		async applyToOpen(before, next, edits) {
			if (d.doc.encodingIssue || activeCompare.current || d.doc.buffer !== before) return false;
			const editor = { doc: d.doc, mode: () => d.modes.mode, kind: d.kind, parseVisual: d.parseVisual };
			const visual = d.modes.mode === 'visual' && hasVisualMode(d.kind());
			// plain words go into the visual editor the way typing puts them, so its comments follow exactly
			const view = visual ? editorViewStore.current : null;
			if (view && editVisualText(view, d.doc, before, next, edits)) return true;
			if (await editOpenFile(editor, before, next, edits)) {
				// paragraphs rebuilt from the source leave their comments behind: carry them over
				if (visual) await d.editedOpenVisual?.(before, next, edits);
				return true;
			}
			// no editor shows it (a .bib in the reference manager): write the file and reload
			if (isDirty.current || !d.doc.path) return false;
			await d.provider().writeText(d.doc.path, fromLf(next, d.doc.eol));
			await d.reloadOpen();
			return true;
		},
		flush: () => d.saver().flushAndWait(),
		read: (path) => d.provider().readSource(path),
		write: (path, text) => d.provider().writeText(path, text),
		encodingError: (encoding) => sourceEncodingError(encoding as Parameters<typeof sourceEncodingError>[0]),
		changed: () => dispatchEvent(new CustomEvent('texpile:fs-changed')),
		edited: d.editedClosed
	};
}

export function makeFolderReplace(d: FolderReplaceDeps): (files: string[], spec: ReplaceSpec) => Promise<void> {
	const deps = replaceDeps(d);
	return async (files, spec) => {
		const out = await attempt(() => replaceInFiles(files, spec, deps));
		if (!out) return;
		const results = count(out.matches, m.globalsearch_results_count_one, m.globalsearch_results_count_other);
		report(out, d.history(), {
			title: m.globalsearch_replaced({ results, files: filesText(out.files) }),
			label: out.files === 1 ? m.filehistory_op_replace_one() : m.filehistory_op_replace_other({ count: out.files }),
			nothing: m.globalsearch_replace_nothing()
		});
	};
}

export type RenameElsewhereDeps = FolderReplaceDeps & {
	root: () => string | null;
	main: () => string | null;
	search: (root: string, query: string, opts: { regex: boolean; caseSensitive: boolean }) => Promise<{ results: SearchFileResult[] }>;
};

/** a label rename stays in its document, a .bib key rename in the documents using that .bib */
async function renameScope(kind: UseKind, d: RenameElsewhereDeps, root: string): Promise<string[]> {
	if (!d.doc.path) return [];
	const open: string = d.doc.path;
	function read(p: string): Promise<string> {
		return samePath(p, open) ? Promise.resolve(d.doc.buffer) : d.provider().readText(p);
	}
	function paths(files: DocFile[]): string[] {
		return files.flatMap((f) => (f.missing ? [] : [f.path]));
	}
	if (kind === 'label') {
		const around = await documentAround(open, d.main(), root, read).catch(() => null);
		return around ? paths(around.files) : [];
	}
	const stem = basename(open).replace(/\.bib$/i, '');
	const naming = await d.search(root, escapeRe(stem), { regex: true, caseSensitive: false });
	const out = new Set<string>();
	const seen = new Set<string>();
	for (const r of naming.results) {
		if (!useLanguageOf(r.file)) continue;
		const around = await documentAround(r.file, d.main(), root, read).catch(() => null);
		if (!around || seen.has(around.main.toLowerCase())) continue;
		seen.add(around.main.toLowerCase());
		if (namesBibliography(around.files, open)) for (const p of paths(around.files)) out.add(p);
	}
	return [...out];
}

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** a settings panel renames per keystroke (fig:r, fig:re...), so a waiting chain runs once, first name to last */
export function makeRenameElsewhere(d: RenameElsewhereDeps): (kind: UseKind, from: string, to: string) => void {
	const deps = replaceDeps(d);
	let pending: { kind: UseKind; from: string; to: string; timer?: ReturnType<typeof setTimeout> } | null = null;

	async function run(kind: UseKind, from: string, to: string): Promise<void> {
		const root = d.root();
		if (!root || !from || !to || from === to) return;
		const langs: UseLanguage[] = ['latex', 'typst'];
		const found = await Promise.all(
			langs.map((lang) => d.search(root, usePattern(kind, from, lang), { regex: true, caseSensitive: true }))
		);
		const scope = await renameScope(kind, d, root);
		const files = [
			...new Set(found.flatMap((r, i) => r.results.filter((f) => useLanguageOf(f.file) === langs[i]).map((f) => f.file)))
		].filter((f) => scope.some((s) => samePath(s, f)));
		if (!files.length) return;
		const out = await attempt(() =>
			replaceInFiles(
				files,
				(path) => {
					const lang = useLanguageOf(path);
					return lang ? renameSpec(kind, from, to, lang) : null;
				},
				deps
			)
		);
		if (!out) return;
		const uses =
			kind === 'label'
				? count(out.matches, m.rename_refs_count_one, m.rename_refs_count_other)
				: count(out.matches, m.rename_cites_count_one, m.rename_cites_count_other);
		// quiet when nothing else moved; no undo, since undoing the rename in the editor brings these along
		report(out, null, {
			title: m.rename_elsewhere_done({ uses, files: filesText(out.files) }),
			label: m.filehistory_op_rename_uses({ from, to }),
			nothing: null
		});
	}

	return (kind, from, to) => {
		if (pending?.kind === kind && pending.to === from) {
			pending.to = to;
		} else if (pending) {
			const earlier = pending;
			clearTimeout(earlier.timer);
			void run(earlier.kind, earlier.from, earlier.to);
			pending = { kind, from, to };
		} else {
			pending = { kind, from, to };
		}
		const current = pending;
		clearTimeout(current.timer);
		current.timer = setTimeout(() => {
			pending = null;
			void run(current.kind, current.from, current.to);
		}, 800);
	};
}

async function attempt(work: () => Promise<ReplaceOutcome>): Promise<ReplaceOutcome | null> {
	try {
		return await work();
	} catch (e) {
		toaster.error({ title: m.globalsearch_replace_failed(), description: e instanceof Error ? e.message : String(e) });
		return null;
	}
}

function count(n: number, one: (a: { count: number }) => string, other: (a: { count: number }) => string): string {
	return n === 1 ? one({ count: 1 }) : other({ count: n });
}

function filesText(n: number): string {
	return count(n, m.globalsearch_files_count_one, m.globalsearch_files_count_other);
}

function report(out: ReplaceOutcome, history: FileHistory | null, text: { title: string; label: string; nothing: string | null }): void {
	if (out.skipped.length) {
		toaster.warning({
			title:
				out.skipped.length === 1
					? m.globalsearch_replace_skipped_one()
					: m.globalsearch_replace_skipped_other({ count: out.skipped.length }),
			description: out.skipped.map((s) => `${basename(s.path)} (${skipReason(s.reason)})`).join(', '),
			duration: 10000
		});
	}
	if (!out.files || !out.undo || !out.redo) {
		if (!out.skipped.length && text.nothing) toaster.info({ title: text.nothing });
		return;
	}

	const entry = history ? { label: text.label, undo: explained(out.undo), redo: explained(out.redo) } : null;
	if (history && entry) history.record(entry);
	toaster.success({
		title: text.title,
		action:
			history && entry
				? {
						label: m.menubar_undo(),
						// the stack holds its entries as reactive proxies, so identity is the undo function's
						onClick: () => history.undoStack.at(-1)?.undo === entry.undo && void history.undo()
					}
				: undefined
	});
}

/** a step that refuses because a file was edited since, saying which file */
function explained(step: () => Promise<void>): () => Promise<void> {
	return async () => {
		try {
			await step();
		} catch (e) {
			if (e instanceof ChangedSinceError) throw new Error(m.globalsearch_replace_changed_since({ name: basename(e.path) }), { cause: e });
			throw e;
		}
	};
}

function skipReason(reason: ReplaceOutcome['skipped'][number]['reason']): string {
	if (reason === 'encoding') return m.globalsearch_skip_encoding();
	if (reason === 'editor') return m.globalsearch_skip_editor();
	return m.globalsearch_skip_failed();
}
