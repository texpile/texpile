// Commands that act on whichever editor is currently showing: focus handoff, Find in Files,
// running the formatter, and the two \input helpers (insert one at the cursor, jump to one).
import { tick } from 'svelte';
import { get } from 'svelte/store';
import { editorViewStore, sourceCmView } from '$lib/stores/editorStore';
import { activeFilePath, workspaceRoot } from '$lib/workspace/workspaceStore';
import { basename, dirname, joinPath, relativeTo, toLf, fromLf, type Eol } from '$lib/workspace/fileSystem';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

/** the longest source selection that will seed the Find in Files query */
const SEED_MAX = 200;

/** return keyboard focus to whichever editor is showing (Esc from panels) */
export function focusEditor(isSourceMode: boolean): void {
	if (isSourceMode) {
		const cm = get(sourceCmView);
		if (cm && cm.dom.isConnected) cm.focus();
	} else {
		get(editorViewStore)?.focus();
	}
}

/** a single-line source selection seeds the Find in Files query */
export function searchSeed(): string | undefined {
	const cm = get(sourceCmView);
	if (!cm || !cm.dom.isConnected) return undefined;
	const { from, to } = cm.state.selection.main;
	if (to <= from || to - from >= SEED_MAX) return undefined;
	const sel = cm.state.sliceDoc(from, to);
	return sel.includes('\n') ? undefined : sel;
}

export interface SearchPanelDeps {
	setSidebarView(view: 'explorer' | 'search' | 'scm'): void;
	openSidebar(): void;
	isSourceMode(): boolean;
	focusInput(seed?: string): void;
}

/** open Find in Files with its input focused */
export async function openGlobalSearch(deps: SearchPanelDeps): Promise<void> {
	const seed = searchSeed();
	deps.setSidebarView('search');
	deps.openSidebar();
	await tick(); // let the panel mount before focusing
	deps.focusInput(seed);
}

/** close Find in Files and hand focus back; tick first so the unmounting input can't re-steal
 * focus to the body */
export async function closeGlobalSearch(deps: SearchPanelDeps): Promise<void> {
	deps.setSidebarView('explorer');
	await tick();
	focusEditor(deps.isSourceMode());
}

export interface FormatDeps {
	getLoadedPath(): string | null;
	getSource(): string;
	getEol(): Eol;
	/** the formatter should see exactly what is on screen */
	flushSaves(): Promise<void>;
	format(path: string, text: string): Promise<string>;
	/** install the reindented text and re-derive both views */
	applyFormatted(text: string): void;
	setBusy(busy: boolean): void;
}

/** Reindent via latexindent and swap the source for the result; both views re-derive from it.
 * No backup file: the confirm modal's warning is the only safety net, undo covers the rest. */
export async function runFormat(deps: FormatDeps): Promise<void> {
	const path = deps.getLoadedPath();
	if (!path) return;
	deps.setBusy(true);
	try {
		await deps.flushSaves();
		const formatted = toLf(await deps.format(path, fromLf(deps.getSource(), deps.getEol())));
		deps.applyFormatted(formatted);
		toaster.success({ title: m.wsview_toast_formatted_title(), description: basename(path) });
	} catch (e) {
		toaster.error({ title: m.wsview_toast_format_failed_title(), description: e instanceof Error ? e.message : String(e) });
	} finally {
		deps.setBusy(false);
	}
}

/** Insert an \input of newFilePath at the cursor in the open visual doc: path relative to the
 * current file's dir, .tex dropped (the form \input takes). False when there is no editor to
 * insert into. */
export function insertIncludeAtCursor(newFilePath: string, loadedPath: string | null, isVisualMode: boolean): boolean {
	if (!loadedPath || !isVisualMode) return false;
	const v = get(editorViewStore);
	const type = v?.state.schema.nodes.includedoc;
	if (!v || !type) return false;
	const rel = relativeTo(dirname(loadedPath), newFilePath).replace(/\.tex$/i, '');
	v.dispatch(v.state.tr.replaceSelectionWith(type.create({ path: rel, command: 'input' })).scrollIntoView());
	v.focus();
	return true;
}

/** F12 on an \input{...} target: resolve the way LaTeX would - current dir, then the project
 * root, adding .tex when the name has no extension. */
export async function jumpToInclude(
	name: string,
	loadedPath: string | null,
	stat: (p: string) => Promise<{ exists: boolean }>
): Promise<void> {
	const root = get(workspaceRoot);
	const base = loadedPath ? dirname(loadedPath) : null;
	const cand = name.trim().replace(/\\/g, '/');
	if (!cand) return;
	const names = /\.[a-z]+$/i.test(cand) ? [cand] : [cand + '.tex'];
	for (const dir of [base, root]) {
		if (!dir) continue;
		for (const n of names) {
			const path = joinPath(dir, n);
			if ((await stat(path)).exists) {
				activeFilePath.set(path);
				return;
			}
		}
	}
}
