// client-side file access, all through the Electron bridge (window.texpileNative):
// data ops over fs:* IPC, raw file bytes over the texfile:// protocol. no browser transport.
import { browser } from '$lib/runtime';
import type { GitStatusResult, GitShowResult, GitOpResult, GitLogResult, GitChangesResult, GitPushResult } from './git';

export type TexFile = {
	name: string;
	path: string;
	relPath: string;
};

export type TreeEntry = {
	name: string;
	path: string;
	type: 'dir' | 'file';
	children?: TreeEntry[];
};

export type SearchFileResult = {
	file: string; // absolute path
	rel: string; // root-relative, forward-slashed
	matches: { line: number; text: string }[];
};

export type DraftPage = {
	n: number;
	w: number;
	h: number;
	// shipout box height = box top to the box BASELINE, i.e. the footer line's baseline;
	// the renderer treats rows at/below it as bottom-anchored (never shifted by patches)
	ht?: number;
	// the shipped vpack's glue_set/sign/order: gsn 1 = the page was stretched to
	// \textheight (flushbottom), so a patch's delta distributes over its vg records
	gs?: number;
	gsn?: number;
	go?: number;
	// the walker's certification reasons for this page (comma-joined: literal, transform,
	// escape, dir); absent when every record on it is safe to paint
	unc?: string;
	records: string; // newline-delimited JSON records for this page
};
export type DraftResult =
	| {
			ok: true;
			ms: number;
			count: number;
			passes: number;
			paperW: number;
			paperH: number;
			colW: number;
			// \textwidth: what a starred float wraps at under twocolumn (0 on older bridges)
			textW?: number;
			// \footskip: body bottom sits at page ht - footSkip; the footer baseline at ht
			footSkip: number;
			// engine registers the renderer used to guess: \columnsep, \baselineskip, \parskip
			colSep?: number;
			blSkip?: number;
			parSkip?: number;
			// \topskip: where a column's first baseline lands (chain-planner landing rule)
			topSkip?: number;
			// the line \begin{document} executed at (main file), from the hook itself
			bodyLine?: number;
			// per-line counter snapshots; the daemon pins typesets to these TRUE values
			counters?: { l: number; f?: string; s: Record<string, number> }[];
			// per-break pruned runs: what TeX discarded at each column/page break
			seams?: { page: number; col: number; pen: number; run: Record<string, number>[] }[];
			marginX: number;
			marginY: number;
			pages: DraftPage[];
	  }
	| { ok: false; error: string; ms: number; log?: string; superseded?: true };

export type ParagraphResult =
	| {
			ok: true;
			records: Record<string, unknown>[];
			// SPLIT requests: records = what fit the requested height, splitRecords = the rest
			splitRecords?: Record<string, unknown>[];
			stats: Record<string, unknown> | null;
			hsize: number;
			textheight: number;
			// engine-truth announce from the warm daemon (float envs, catcode table)
			floats?: string[];
			cats?: number[];
	  }
	| { ok: false; error: string };

// one page-skeleton item: a line as a bare box, glue at natural size, or a penalty
export type SkeletonItem =
	{ t: 'b'; h: number; d: number } | { t: 'g'; w: number; st: number; sto: number; sh: number; sho: number } | { t: 'p'; p: number };

export type SkeletonResult =
	{ ok: true; kA: number; kB: number; gs: number; gsn: number; go: number; ys: number[] } | { ok: false; error: string };

type TexpileNative = {
	/** answered synchronously in preload, so the first render already knows what it is opening */
	bootstrap?: { open: { kind: 'file' | 'folder'; path: string } | null; settings: Record<string, unknown> };
	openFolder: () => Promise<string | null>;
	onOpenPath?: (cb: (filePath: string) => void) => () => void;
	onOpenFolder?: (cb: (root: string) => void) => () => void;
	claimWorkspace?: (root: string) => Promise<{ ok: boolean; reason?: string }>;
	releaseWorkspace?: () => Promise<{ ok: boolean }>;
	newWindow?: () => Promise<void>;
	toggleDevTools?: () => void;
	reloadWorkspace?: () => void;
	openFolderNewWindow?: () => Promise<string | null>;
	claimStartupTasks?: () => Promise<boolean>;
	onBeforeClose?: (cb: () => void) => () => void;
	onWorkspaceFsChanged?: (cb: () => void) => () => void;
	closeDecision?: (proceed: boolean) => void;
	setZoomFactor?: (factor: number) => Promise<number>;
	fsScan: (root: string, exts?: string) => Promise<{ root: string; files: TexFile[] }>;
	fsRead: (path: string) => Promise<{ content: string }>;
	fsWrite: (path: string, content: string) => Promise<{ ok: boolean }>;
	fsWriteBinary: (path: string, bytes: ArrayBuffer) => Promise<{ ok: boolean }>;
	fsTree: (root: string) => Promise<{ root: string; children: TreeEntry[] }>;
	fsTreeScan: (root: string, exts?: string) => Promise<{ root: string; children: TreeEntry[]; files: TexFile[] }>;
	fsOp: (body: Record<string, unknown>) => Promise<{ ok: boolean }>;
	fsTrash: (body: { path: string; root: string }) => Promise<{ backup: string | null; recycled: boolean }>;
	fsPurgeUndo: (root: string) => Promise<{ ok: boolean }>;
	revealItem?: (path: string) => Promise<{ ok: boolean }>;
	fsSearch: (
		root: string,
		q: string,
		regex: boolean,
		caseSensitive: boolean
	) => Promise<{ results: SearchFileResult[]; truncated: boolean; total?: number; error?: string }>;
	fsStat: (path: string) => Promise<{ exists: boolean; mtimeMs: number; size: number }>;
	fsFormatLatex: (path: string, text: string) => Promise<{ formatted: string }>;
	synctex: (body: Record<string, unknown>) => Promise<Record<string, unknown>>;
	draftCompile: (body: { root: string; mainFile: string }) => Promise<DraftResult>;
	draftTypeset: (body: { root: string; mainFile: string; text: string; hsize?: number; splitTo?: number }) => Promise<ParagraphResult>;
	draftSkeleton?: (body: {
		root: string;
		mainFile: string;
		items: SkeletonItem[];
		targetPt: number;
		capacity?: boolean;
	}) => Promise<SkeletonResult>;
	draftStop: () => Promise<{ ok: boolean }>;
	draftTakeover?: (body: { root: string }) => Promise<{ ok: boolean }>;
	onDraftPreempted?: (cb: (notice: { root: string }) => void) => () => void;
	draftSavePdf: (body: { root: string; defaultName: string; to?: string }) => Promise<{ saved: boolean; path?: string }>;
	savePdfAs?: (body: { src: string; defaultPath: string; to?: string }) => Promise<{ saved: boolean; path?: string }>;
	savePdfBytes?: (body: { bytes: Uint8Array; defaultName: string; to?: string }) => Promise<{ saved: boolean; path?: string }>;
	gitStatus: (root: string) => Promise<GitStatusResult>;
	gitShow: (path: string) => Promise<GitShowResult>;
	gitInit: (dir: string) => Promise<GitOpResult>;
	gitStage: (root: string, paths: string[]) => Promise<GitOpResult>;
	gitUnstage: (root: string, paths: string[]) => Promise<GitOpResult>;
	gitDiscard: (root: string, paths: string[]) => Promise<GitOpResult>;
	gitCommit: (root: string, message: string) => Promise<GitOpResult>;
	gitUserName: (root: string) => Promise<{ ok: true; name: string | null }>;
	// optional: an older preload predates the history surface, and the client degrades to no history
	gitLog?: (root: string, limit?: number) => Promise<GitLogResult>;
	gitChangesSince?: (root: string, hash: string) => Promise<GitChangesResult>;
	gitShowAt?: (path: string, ref: string) => Promise<GitShowResult>;
	gitRestore?: (root: string, hash: string, message: string) => Promise<GitOpResult>;
	gitPush?: (root: string) => Promise<GitPushResult>;
};

export function nativeBridge(): TexpileNative | undefined {
	if (!browser) return undefined;
	return (window as unknown as { texpileNative?: TexpileNative }).texpileNative;
}

/** the Electron bridge, or a clear error outside the desktop shell (the message can reach a toast). */
function requireNative(): TexpileNative {
	const n = nativeBridge();
	if (!n) throw new Error('File access requires the Texpile desktop app.');
	return n;
}

/** whether we're running inside the Electron shell. */
export function isDesktop(): boolean {
	return !!nativeBridge()?.openFolder;
}

/** opens the native folder picker; null when cancelled or outside the desktop shell. */
export async function pickFolder(): Promise<string | null> {
	const n = nativeBridge();
	return n ? n.openFolder() : null;
}

/** registers this window as the folder's owner. { ok:false } means another window already
 *  has it open (that window was focused); the caller should abort its own open. */
export async function claimWorkspace(root: string): Promise<{ ok: boolean; reason?: string }> {
	const n = nativeBridge();
	if (!n?.claimWorkspace) return { ok: true }; // browser dev: single window, nothing to claim
	try {
		return await n.claimWorkspace(root);
	} catch {
		return { ok: true };
	}
}

/** marks this window as back on the start screen (frees the folder for other windows). */
export function releaseWorkspace(): void {
	void nativeBridge()
		?.releaseWorkspace?.()
		.catch(() => {});
}

/** opens an empty new window. */
export function openNewWindow(): void {
	void nativeBridge()?.newWindow?.();
}

/** folder picker + new window in one step; dedupes against windows that already have it. */
export function openFolderInNewWindow(): void {
	void nativeBridge()?.openFolderNewWindow?.();
}

// an IPC rejection reads "Error invoking remote method 'fs:x': Error: <msg>"; surface
// just <msg>, these strings end up verbatim in user-facing toasts
async function ipc<T>(call: Promise<T>): Promise<T> {
	try {
		return await call;
	} catch (e) {
		const raw = e instanceof Error ? e.message : String(e);
		throw new Error(raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, ''), { cause: e });
	}
}

export async function scanTexFiles(root: string): Promise<{ root: string; files: TexFile[] }> {
	return ipc(requireNative().fsScan(root));
}

export async function scanFiles(root: string, exts: string[]): Promise<{ root: string; files: TexFile[] }> {
	return ipc(requireNative().fsScan(root, exts.join(',')));
}

export async function scanTree(root: string): Promise<{ root: string; children: TreeEntry[] }> {
	return ipc(requireNative().fsTree(root));
}

/** tree + flat .tex list from ONE native traversal (the refresh path used to walk twice). */
export async function scanTreeAndFiles(root: string, exts?: string[]): Promise<{ root: string; children: TreeEntry[]; files: TexFile[] }> {
	return ipc(requireNative().fsTreeScan(root, exts?.join(',')));
}

async function op(payload: Record<string, unknown>): Promise<{ ok: boolean; trashed?: string }> {
	return ipc(requireNative().fsOp(payload));
}
/** the common case: run the op and discard the reply, which only 'trash' has anything in. */
async function opVoid(payload: Record<string, unknown>): Promise<void> {
	await op(payload);
}

export function createEntry(path: string, type: 'file' | 'dir', content = '') {
	return opVoid({ action: 'create', path, type, content });
}
export function deleteEntry(path: string) {
	return opVoid({ action: 'delete', path });
}
export function renameEntry(from: string, to: string) {
	return opVoid({ action: 'rename', from, to });
}
/** recursive copy; fails instead of overwriting an existing destination. */
export function copyEntry(from: string, to: string) {
	return opVoid({ action: 'copy', from, to });
}

/**
 * The undoable delete: back the entry up outside the workspace, then send it to the OS recycle bin.
 *
 * `backup` is null when the entry was too large to copy - still deleted, just not undoable here.
 * `recycled` is false when the OS had nowhere to put it and it had to be unlinked instead. Both
 * are reported rather than inferred, because the two failures compound: neither one leaves anything
 * to recover from, and that is the only case worth interrupting the user about.
 */
export async function trashEntry(path: string, root: string): Promise<{ backup: string | null; recycled: boolean }> {
	const r = await ipc(requireNative().fsTrash({ path, root }));
	return { backup: r?.backup ?? null, recycled: r?.recycled !== false };
}

/** copy a backed-up entry back into place; refuses rather than overwrite whatever stands at `to`. */
export function restoreEntry(from: string, to: string) {
	return opVoid({ action: 'restore', from, to });
}

/** discard this folder's undo backups; called when the workspace is opened. */
export async function purgeUndoBackups(root: string): Promise<void> {
	await ipc(requireNative().fsPurgeUndo(root));
}

/** select the file in the OS file manager. A no-op outside the desktop shell. */
export async function revealItem(path: string): Promise<void> {
	await nativeBridge()?.revealItem?.(path);
}

/**
 * Offer `src` (a PDF already on disk) through a native save dialog. `{saved: false}` covers both
 * a cancelled dialog and a non-desktop shell, so callers treat them the same: say nothing.
 */
export async function savePdfAs(src: string, defaultPath: string): Promise<{ saved: boolean; path?: string }> {
	return (await nativeBridge()?.savePdfAs?.({ src, defaultPath })) ?? { saved: false };
}

/**
 * Offer PDF bytes the renderer is holding through a native save dialog. Used where there is no
 * file to point `savePdfAs` at: a collaboration guest only ever has the document in memory.
 * `{saved: false}` again covers both a cancelled dialog and a non-desktop shell.
 */
export async function savePdfBytes(bytes: Uint8Array, defaultName: string): Promise<{ saved: boolean; path?: string }> {
	return (await nativeBridge()?.savePdfBytes?.({ bytes, defaultName })) ?? { saved: false };
}

export async function readTextFile(path: string): Promise<string> {
	return (await ipc(requireNative().fsRead(path))).content;
}

export async function writeTextFile(path: string, content: string): Promise<void> {
	await ipc(requireNative().fsWrite(path, content));
}

export async function writeBinaryFile(path: string, file: Blob): Promise<void> {
	await ipc(requireNative().fsWriteBinary(path, await file.arrayBuffer()));
}

/** reindents LaTeX source via latexindent; throws if it isn't installed. */
export async function formatLatexDocument(path: string, text: string): Promise<string> {
	return (await ipc(requireNative().fsFormatLatex(path, text))).formatted;
}

// URL serving a local file's raw bytes (editor images, the compiled PDF). texfile:// answers
// with CORS headers so it works from both the packaged app:// origin and the vite dev origin.
export function fileUrl(path: string): string {
	return `texfile://local/?path=${encodeURIComponent(path)}`;
}

/** never throws; used to poll for a freshly written compile output. */
export async function statFile(path: string): Promise<{ exists: boolean; mtimeMs: number; size: number }> {
	try {
		return await requireNative().fsStat(path);
	} catch {
		return { exists: false, mtimeMs: 0, size: 0 };
	}
}

/** project-wide "Find in Files": matching lines across the folder, grouped by file. */
export async function searchInFolder(
	root: string,
	query: string,
	opts?: { regex?: boolean; caseSensitive?: boolean }
): Promise<{ results: SearchFileResult[]; truncated: boolean; total?: number; error?: string }> {
	try {
		return await requireNative().fsSearch(root, query, !!opts?.regex, !!opts?.caseSensitive);
	} catch (e) {
		return { results: [], truncated: false, error: e instanceof Error ? e.message : String(e) };
	}
}

// the editor works in LF internally; a file's original ending is read on load and
// re-applied on save so a Windows CRLF file round-trips byte-for-byte
export type Eol = '\r\n' | '\n';

/** the file's dominant line ending: CRLF if any \r\n is present, else LF. */
export function detectEol(text: string): Eol {
	return text.includes('\r\n') ? '\r\n' : '\n';
}

export function toLf(text: string): string {
	return text.replace(/\r\n?/g, '\n');
}

export function fromLf(text: string, eol: Eol): string {
	return eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
}

/** basename helper that works for both / and \ separators. */
export function basename(path: string): string {
	return path.split(/[\\/]/).pop() || path;
}

export function dirname(path: string): string {
	const parts = path.split(/[\\/]/);
	parts.pop();
	return parts.join('/');
}

/** Path equality that ignores separator style and case (Windows paths reach us both ways). */
export function samePath(a: string, b: string) {
	return a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase();
}

// joins dir + rel using the dir's own separator so results match the native paths the scan/tree
// return; a mixed "C:\ws/sub" path would miss the exact-match file-tree highlight
export function joinPath(dir: string, rel: string): string {
	if (!dir) return rel;
	const sep = dir.includes('\\') ? '\\' : '/';
	const cleanRel = rel.replace(/^[\\/]+/, '').replace(/[\\/]/g, sep);
	return `${dir.replace(/[\\/]+$/, '')}${sep}${cleanRel}`;
}

/**
 * Collapse '.' and '..' segments without touching the filesystem. Native calls resolve these
 * themselves, but string-matched paths (a guest's manifest lookups, tree highlights) need the
 * canonical form. A '..' that would climb past the first segment is KEPT, so a caller can still
 * see the path escaping its base instead of getting a silently reanchored one.
 */
export function normalizePath(p: string): string {
	const sep = p.includes('\\') ? '\\' : '/';
	function isRootSeg(s: string) {
		return s === '' || /^[A-Za-z]:$/.test(s);
	}
	const out: string[] = [];
	for (const part of p.split(/[\\/]/)) {
		if (part === '.' || (part === '' && out.length > 0)) continue;
		if (part === '..' && out.length && out[out.length - 1] !== '..' && !isRootSeg(out[out.length - 1])) out.pop();
		else out.push(part);
	}
	return out.join(sep);
}

/** is `p` the workspace root or inside it, separator- and case-insensitively */
export function underRoot(root: string, p: string): boolean {
	const r = root.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
	const q = p.replace(/\\/g, '/').toLowerCase();
	return q === r || q.startsWith(r + '/');
}

/** untitled.tex -> untitled1.tex when taken, so a pre-filled "New" name can't collide. */
export function freeName(name: string, taken: Iterable<string>): string {
	const used = new Set([...taken].map((n) => n.toLowerCase()));
	if (!used.has(name.toLowerCase())) return name;
	const dot = name.lastIndexOf('.');
	const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
	let i = 1;
	while (used.has(`${stem}${i}${ext}`.toLowerCase())) i++;
	return `${stem}${i}${ext}`;
}

/** recovers the absolute path encoded in a fileUrl(), or null if not one. */
export function pathFromFileUrl(url: string): string | null {
	const m = url.match(/^texfile:\/\/local\/?\?path=([^&]+)/);
	return m ? decodeURIComponent(m[1]) : null;
}

/** true for srcs that should NOT be treated as on-disk relative paths. */
export function isRemoteSrc(src: string): boolean {
	return /^(https?:|data:|blob:|file:|texfile:|\/)/i.test(src);
}

/** makes an absolute path relative to a directory (best-effort, forward slashes). */
export function relativeTo(dir: string, abs: string): string {
	const d = dir.replace(/[\\/]+$/, '') + '/';
	const a = abs.replace(/\\/g, '/');
	const dd = d.replace(/\\/g, '/');
	return a.startsWith(dd) ? a.slice(dd.length) : abs;
}
