// Reports what this window is showing to the Electron main process, for the MCP get_editor_state
// tool. Push, not pull: main caches the last payload, so a tool call answers instantly even while
// this renderer is blocked building a large ProseMirror document.
//
// Called from a $effect in WorkspaceView. buildWindowState reads everything untracked, so that
// effect names its dependencies itself. Adding a state-backed field here means adding it there
// too, or the cache silently stops reflecting it.
import { untrack } from 'svelte';
import { browser } from '$lib/runtime';
import { workspaceRoot, mainFile, activeFilePath, isDirty } from './workspaceStore';
import { compileConfig } from './projectConfigSync.svelte';
import { tabs } from './tabs.svelte';
import { sourceCmView } from '$lib/stores/editorStore';
import { relativeTo } from './fileSystem';
import { collabHost } from '$lib/collab/hostStore.svelte';

export type ViewMode = 'visual' | 'source' | 'diff';

type TabPayload = {
	path: string;
	dirty: boolean;
	active: boolean;
};

export type WindowStatePayload = {
	mainFile: string | null;
	activeFile: string | null;
	viewMode: ViewMode | null;
	tabs: TabPayload[];
	cursor: { line: number; column: number } | null;
	selection: { text: string } | null;
	/** live preview instead of the shell compile. Changes what compile does, which PDF exists, and
	 *  where diagnostics come from, so it belongs in the state an agent reads BEFORE any of that. */
	livePreview: boolean;
};

type NativeMcp = {
	mcpPublishState?: (state: WindowStatePayload) => void;
};
function nativeBridge(): NativeMcp | undefined {
	if (!browser) return undefined;
	return (window as unknown as { texpileNative?: NativeMcp }).texpileNative;
}

/** paths cross the boundary workspace-relative: an agent thinks in project paths, and absolute
 *  ones would leak the user's home directory for no benefit */
function rel(path: string | null, root: string | null): string | null {
	if (!path) return null;
	if (!root) return path;
	return relativeTo(root, path);
}

/** longer than this and it is not a selection an agent needs verbatim */
const MAX_SELECTION = 2000;

function readCursorAndSelection(view: ViewMode | null): Pick<WindowStatePayload, 'cursor' | 'selection'> {
	// Source mode only. In visual mode the caret is a ProseMirror position, which does not map to a
	// source line without the SyncTeX-style mapping in syncTexNav, and a position an agent cannot
	// interpret is worse than an honest null.
	if (view !== 'source') return { cursor: null, selection: null };
	const cm = sourceCmView.current;
	if (!cm || !cm.dom.isConnected) return { cursor: null, selection: null };
	const { from, to } = cm.state.selection.main;
	const line = cm.state.doc.lineAt(from);
	const text = to > from ? cm.state.sliceDoc(from, Math.min(to, from + MAX_SELECTION)) : '';
	return {
		cursor: { line: line.number, column: from - line.from + 1 },
		selection: text ? { text } : null
	};
}

export function buildWindowState(viewMode: ViewMode | null): WindowStatePayload {
	// untracked wholesale: the effects that call this name their own dependencies, and a read
	// here must never become one (the get() calls this replaced were non-reactive by design)
	return untrack(() => {
		const root = workspaceRoot.current;
		const active = activeFilePath.current;
		// the open file's mark is the one the tab bar paints; any other tab's file can hold edits a session wrote into it
		const dirty = isDirty.current;
		function unwritten(p: string): boolean {
			const r = collabHost.keyOf(p);
			return !!r && !!collabHost.files?.isDirty(r);
		}
		const list = tabs.paths;
		return {
			mainFile: rel(mainFile.current, root),
			activeFile: rel(active, root),
			viewMode,
			tabs: list.map((p) => ({
				path: rel(p, root) ?? p,
				dirty: !!active && p === active ? dirty : unwritten(p),
				active: !!active && p === active
			})),
			livePreview: compileConfig.current.latex.liveMode,
			...readCursorAndSelection(viewMode)
		};
	});
}

let last = '';

/** Publishes only on change. The effect driving this re-runs on any tracked read, including ones
 *  that leave the payload identical (a keystroke marks the doc dirty every time), and the IPC is
 *  not worth paying for those. */
export function publishWindowState(viewMode: ViewMode | null): void {
	const api = nativeBridge();
	if (!api?.mcpPublishState) return;
	const payload = buildWindowState(viewMode);
	const key = JSON.stringify(payload);
	if (key === last) return;
	last = key;
	api.mcpPublishState(payload);
}
