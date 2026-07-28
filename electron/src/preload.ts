import { contextBridge, ipcRenderer } from 'electron';

/** unwraps the { ok, value | error } results from main.ts handleFs back into throw semantics. */
async function invokeFs(channel: string, ...args: unknown[]): Promise<unknown> {
	const r = (await ipcRenderer.invoke(channel, ...args)) as { ok: boolean; value?: unknown; error?: string };
	if (r && r.ok) return r.value;
	throw new Error(r?.error ?? 'Unknown error');
}

// main pushes open-path/open-folder on did-finish-load, which can beat the renderer's
// subscription (mount waits on the settings IPC; the route-split boot is fast enough to lose
// that race). Buffer here — preload runs before any page code — and flush on subscribe.
function bufferedChannel<T>(channel: string, map: (...args: unknown[]) => T) {
	const queued: T[] = [];
	let handler: ((v: T) => void) | null = null;
	ipcRenderer.on(channel, (_e, ...args: unknown[]) => {
		const v = map(...args);
		if (handler) handler(v);
		else queued.push(v);
	});
	return (cb: (v: T) => void) => {
		handler = cb;
		while (queued.length) cb(queued.shift()!);
		return () => {
			handler = null;
		};
	};
}
const onOpenPathBuffered = bufferedChannel('main:open-path', (p) => String(p));
const onOpenFolderBuffered = bufferedChannel('main:open-folder', (r) => String(r));

contextBridge.exposeInMainWorld('texpileNative', {
	/** native folder picker; resolves to the chosen absolute path or null. */
	openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
	getSettings: () => ipcRenderer.invoke('settings:get'),
	/** merges a partial update into settings; resolves to the updated settings. */
	setSettings: (partial: Record<string, unknown>) => ipcRenderer.invoke('settings:set', partial),
	/** set the whole-window zoom factor (clamped 0.5..2.5); resolves to the applied factor. */
	setZoomFactor: (factor: number) => ipcRenderer.invoke('window:setZoom', factor),
	/** subscribe to "open this .tex" requests from the OS; buffered, returns an unsubscribe fn. */
	onOpenPath: (cb: (filePath: string) => void) => onOpenPathBuffered(cb),
	/** subscribe to "open this folder" pushes (session restore, Open Folder in New Window). */
	onOpenFolder: (cb: (root: string) => void) => onOpenFolderBuffered(cb),
	/** register this window as the folder's owner; { ok:false } means another window has it (and was focused). */
	claimWorkspace: (root: string) => ipcRenderer.invoke('workspace:claim', root),
	/** mark this window as back on the start screen. */
	releaseWorkspace: () => ipcRenderer.invoke('workspace:release'),
	/** open an empty new window. */
	newWindow: () => ipcRenderer.invoke('window:new'),
	/** folder picker + new window in one step (deduped against already-open folders). */
	openFolderNewWindow: () => ipcRenderer.invoke('window:openFolderNew'),
	/** true exactly once per app session; the winner runs the update check / What's New. */
	claimStartupTasks: () => ipcRenderer.invoke('session:claimStartupTasks'),
	/** subscribe to "this window is about to close" (main holds the close until closeDecision). */
	onBeforeClose: (cb: () => void) => {
		const h = () => cb();
		ipcRenderer.on('app:before-close', h);
		return () => ipcRenderer.removeListener('app:before-close', h);
	},
	/** answer a held close: true proceeds (after flushing), false keeps the window open. */
	closeDecision: (proceed: boolean) => ipcRenderer.send('window:close-decision', proceed),

	/** recursively scan a folder for files of the given extensions (CSV, default 'tex'). */
	fsScan: (root: string, exts?: string) => invokeFs('fs:scan', root, exts),
	/** read a text file -> { content }. */
	fsRead: (path: string) => invokeFs('fs:read', path),
	fsWrite: (path: string, content: string) => invokeFs('fs:write', path, content),
	/** write raw bytes, creating parent dirs -> { ok }. */
	fsWriteBinary: (path: string, data: ArrayBuffer) => invokeFs('fs:writeBinary', path, data),
	/** nested file/folder tree -> { root, children }. */
	fsTree: (root: string) => invokeFs('fs:tree', root),
	/** tree + flat file scan (CSV exts, default 'tex') in ONE walk -> { root, children, files }. */
	fsTreeScan: (root: string, exts?: string) => invokeFs('fs:treeScan', root, exts),
	/** create / delete / rename -> { ok }. */
	fsOp: (body: Record<string, unknown>) => invokeFs('fs:op', body),
	/** find-in-files -> { results, truncated, total? }. */
	fsSearch: (root: string, q: string, regex: boolean, caseSensitive: boolean) => invokeFs('fs:search', root, q, regex, caseSensitive),
	/** { exists, mtimeMs, size }, used to poll for a freshly-written compile output. */
	fsStat: (path: string) => invokeFs('fs:stat', path),
	/** reindent via latexindent -> { formatted }; throws if latexindent isn't on PATH. */
	fsFormatLatex: (path: string, text: string) => invokeFs('fs:formatLatex', path, text),
	synctex: (body: Record<string, unknown>) => invokeFs('synctex:call', body),
	/** Draft-mode compile: runs lualatex with the per-page extractor hook -> the real
	 * engine's exact per-page positioned records. -> { ok, pages, paperW, paperH, ... }. */
	draftCompile: (body: { root: string; mainFile: string }) => invokeFs('draft:compile', body),
	/** Draft-mode instant path: typeset ONE paragraph on the warm daemon (~1-2ms). */
	draftTypeset: (body: { root: string; mainFile: string; text: string; hsize?: number }) => invokeFs('draft:typeset', body),
	/** Stop the warm daemon (draft mode off / preview closed) so it stops holding memory. */
	draftStop: () => invokeFs('draft:stop', {}),
	/** Steal the warm engine from the window that currently owns it (explicit user action). */
	draftTakeover: (body: { root: string }) => invokeFs('draft:takeover', body),
	/** subscribe to "another window took the engine" pushes; returns an unsubscribe fn. */
	onDraftPreempted: (cb: (info: { root: string }) => void) => {
		const h = (_e: unknown, info: { root: string }) => cb(info);
		ipcRenderer.on('draft:preempted', h);
		return () => ipcRenderer.removeListener('draft:preempted', h);
	},
	/** Save the live preview's reconcile PDF via a save dialog -> { saved, path? }. */
	draftSavePdf: (body: { root: string; defaultName: string; to?: string }) => invokeFs('draft:savePdf', body),

	/** per-file git status + branch -> { ok, branch?, entries? }. */
	gitStatus: (root: string) => invokeFs('git:status', root),
	/** committed (HEAD) contents of a file for diffing -> { ok, hasHead, content? }. */
	gitShow: (path: string) => invokeFs('git:show', path),
	gitInit: (dir: string) => invokeFs('git:init', dir),
	/** stage files (empty = all). */
	gitStage: (root: string, paths: string[]) => invokeFs('git:stage', root, paths),
	/** unstage files (empty = all). */
	gitUnstage: (root: string, paths: string[]) => invokeFs('git:unstage', root, paths),
	/** discard unstaged changes to tracked files. */
	gitDiscard: (root: string, paths: string[]) => invokeFs('git:discard', root, paths),
	gitCommit: (root: string, message: string) => invokeFs('git:commit', root, message)
});

// in-app updates: check/download are explicit renderer calls, events stream back per channel
contextBridge.exposeInMainWorld('texpileUpdates', {
	/** ask the feed for a newer version -> { status: 'update' | 'none' | 'error' | 'unsupported', ... }.
	 *  `manual` skips the check counter. */
	check: (manual = false) => ipcRenderer.invoke('update:check', manual),
	/** start downloading the update found by check(); progress arrives via onProgress, and the
	 *  downloaded update installs at next quit (or immediately via install()). */
	download: () => invokeFs('update:download'),
	/** quit and install the downloaded update (relaunches). */
	install: () => ipcRenderer.invoke('update:install'),
	onProgress: (cb: (p: { percent: number; transferred: number; total: number }) => void) => {
		const h = (_e: unknown, p: { percent: number; transferred: number; total: number }) => cb(p);
		ipcRenderer.on('update:progress', h);
		return () => ipcRenderer.removeListener('update:progress', h);
	},
	onDownloaded: (cb: (info: { version: string }) => void) => {
		const h = (_e: unknown, info: { version: string }) => cb(info);
		ipcRenderer.on('update:downloaded', h);
		return () => ipcRenderer.removeListener('update:downloaded', h);
	},
	onError: (cb: (err: { message: string }) => void) => {
		const h = (_e: unknown, err: { message: string }) => cb(err);
		ipcRenderer.on('update:error', h);
		return () => ipcRenderer.removeListener('update:error', h);
	}
});

// terminal bridge to the node-pty shells in the main process, keyed by a string `id`
contextBridge.exposeInMainWorld('texpileTerminal', {
	/** whether node-pty loaded (false if it needs `pnpm electron:rebuild`). */
	available: () => ipcRenderer.invoke('terminal:available'),
	/** spawn (or reuse) a shell for `id` in `cwd`. Resolves { ok, shell?, error? }. */
	spawn: (opts: { id: string; cwd?: string; cols?: number; rows?: number }) => ipcRenderer.invoke('terminal:spawn', opts),
	/** send keystrokes (append '\r' to run a command). */
	write: (id: string, data: string) => ipcRenderer.send('terminal:input', { id, data }),
	resize: (id: string, cols: number, rows: number) => ipcRenderer.send('terminal:resize', { id, cols, rows }),
	kill: (id: string) => ipcRenderer.send('terminal:kill', { id }),
	/** subscribe to output; cb gets { id, data }. Returns an unsubscribe fn. */
	onData: (cb: (msg: { id: string; data: string }) => void) => {
		const h = (_e: unknown, msg: { id: string; data: string }) => cb(msg);
		ipcRenderer.on('terminal:data', h);
		return () => ipcRenderer.removeListener('terminal:data', h);
	},
	/** subscribe to shell exit; cb gets { id, code }. Returns an unsubscribe fn. */
	onExit: (cb: (msg: { id: string; code: number }) => void) => {
		const h = (_e: unknown, msg: { id: string; code: number }) => cb(msg);
		ipcRenderer.on('terminal:exit', h);
		return () => ipcRenderer.removeListener('terminal:exit', h);
	}
});
