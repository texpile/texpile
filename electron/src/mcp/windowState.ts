// Cache of what each window is showing, kept in main so an MCP tool can answer instantly.
//
// PUSHED from the renderers, not pulled. Pulling would mean a request/response round trip into a
// renderer that may be mid-way through building a ProseMirror document, which blocks its main
// thread for a second or more on a large paper. A tool call that has to wait that out (or time out
// and lie) is worse than one answering from a cache that is a few hundred ms stale.
//
// Main already owns the root -> window mapping via the `windowRoots` registry in main.ts, so roots
// never need a round trip at all. Only the per-window detail below does.
import type { BrowserWindow } from 'electron';

export type TabState = {
	/** workspace-relative */
	path: string;
	dirty: boolean;
	active: boolean;
};

export type WindowState = {
	mainFile: string | null;
	activeFile: string | null;
	viewMode: 'visual' | 'source' | null;
	tabs: TabState[];
	cursor: { line: number; column: number } | null;
	selection: { text: string } | null;
	/** live preview rather than the shell compile: compile only nudges an engine already running,
	 *  the PDF is _draft/draft.pdf, and diagnostics come from that engine's own log */
	livePreview: boolean;
	/** what Compile runs: the live LaTeX engine, the Typst preview, or the project's command in a terminal */
	compileMode: 'live' | 'typst-preview' | 'terminal';
	/** when the renderer last pushed; exposed so a stale window is visible rather than silently old */
	updatedAt: number;
};

export type WorkspaceSnapshot = WindowState & {
	/** absolute; null for a window with no folder open */
	root: string | null;
	focused: boolean;
};

const byWebContents = new Map<number, WindowState>();

/** a renderer reporting what it currently shows */
export function publishWindowState(wcId: number, state: Omit<WindowState, 'updatedAt'>): void {
	byWebContents.set(wcId, { ...state, updatedAt: Date.now() });
}

export function forgetWindow(wcId: number): void {
	byWebContents.delete(wcId);
}

const EMPTY: WindowState = {
	mainFile: null,
	activeFile: null,
	viewMode: null,
	tabs: [],
	cursor: null,
	selection: null,
	livePreview: false,
	compileMode: 'terminal',
	updatedAt: 0
};

/**
 * Every open window, newest state first-hand from the cache.
 *
 * A window that has not pushed yet still appears (with empty detail) rather than being omitted:
 * "one window, nothing open" and "no windows at all" are different situations and an agent should
 * be able to tell them apart.
 */
export function snapshotWindows(windows: BrowserWindow[], rootFor: (wcId: number) => string | null): WorkspaceSnapshot[] {
	return windows.map((w) => {
		const id = w.webContents.id;
		return {
			root: rootFor(id),
			focused: w.isFocused(),
			...(byWebContents.get(id) ?? EMPTY)
		};
	});
}
