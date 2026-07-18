// client-side file access, all through the Electron bridge (window.texpileNative):
// data ops over fs:* IPC, raw file bytes over the texfile:// protocol. no browser transport.
import { browser } from '$lib/runtime';
import type { GitStatusResult, GitShowResult, GitOpResult } from './git';

export interface TexFile {
	name: string;
	path: string;
	relPath: string;
}

export interface TreeEntry {
	name: string;
	path: string;
	type: 'dir' | 'file';
	children?: TreeEntry[];
}

export interface SearchFileResult {
	file: string; // absolute path
	rel: string; // root-relative, forward-slashed
	matches: { line: number; text: string }[];
}

export interface DraftPage {
	n: number;
	w: number;
	h: number;
	// shipout box height = box top to the box BASELINE, i.e. the footer line's baseline;
	// the renderer treats rows at/below it as bottom-anchored (never shifted by patches)
	ht?: number;
	records: string; // newline-delimited JSON records for this page
}
export type DraftResult =
	| {
			ok: true;
			ms: number;
			count: number;
			passes: number;
			paperW: number;
			paperH: number;
			colW: number;
			// \footskip: body bottom sits at page ht - footSkip; the footer baseline at ht
			footSkip: number;
			marginX: number;
			marginY: number;
			pages: DraftPage[];
	  }
	| { ok: false; error: string; ms: number; log?: string; superseded?: true };

export type ParagraphResult =
	| { ok: true; records: Record<string, unknown>[]; stats: Record<string, unknown> | null; hsize: number; textheight: number }
	| { ok: false; error: string };

interface TexpileNative {
	openFolder: () => Promise<string | null>;
	onOpenPath?: (cb: (filePath: string) => void) => () => void;
	setZoomFactor?: (factor: number) => Promise<number>;
	fsScan: (root: string, exts?: string) => Promise<{ root: string; files: TexFile[] }>;
	fsRead: (path: string) => Promise<{ content: string }>;
	fsWrite: (path: string, content: string) => Promise<{ ok: boolean }>;
	fsWriteBinary: (path: string, data: ArrayBuffer) => Promise<{ ok: boolean }>;
	fsTree: (root: string) => Promise<{ root: string; children: TreeEntry[] }>;
	fsOp: (body: Record<string, unknown>) => Promise<{ ok: boolean }>;
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
	draftTypeset: (body: { root: string; mainFile: string; text: string; hsize?: number }) => Promise<ParagraphResult>;
	draftStop: () => Promise<{ ok: boolean }>;
	draftSavePdf: (body: { root: string; defaultName: string; to?: string }) => Promise<{ saved: boolean; path?: string }>;
	gitStatus: (root: string) => Promise<GitStatusResult>;
	gitShow: (path: string) => Promise<GitShowResult>;
	gitInit: (dir: string) => Promise<GitOpResult>;
	gitStage: (root: string, paths: string[]) => Promise<GitOpResult>;
	gitUnstage: (root: string, paths: string[]) => Promise<GitOpResult>;
	gitDiscard: (root: string, paths: string[]) => Promise<GitOpResult>;
	gitCommit: (root: string, message: string) => Promise<GitOpResult>;
}

export function native(): TexpileNative | undefined {
	if (!browser) return undefined;
	return (window as unknown as { texpileNative?: TexpileNative }).texpileNative;
}

/** the Electron bridge, or a clear error outside the desktop shell (the message can reach a toast). */
function requireNative(): TexpileNative {
	const n = native();
	if (!n) throw new Error('File access requires the Texpile desktop app.');
	return n;
}

/** whether we're running inside the Electron shell. */
export function isDesktop(): boolean {
	return !!native()?.openFolder;
}

/** opens the native folder picker; null when cancelled or outside the desktop shell. */
export async function pickFolder(): Promise<string | null> {
	const n = native();
	return n ? n.openFolder() : null;
}

// an IPC rejection reads "Error invoking remote method 'fs:x': Error: <msg>"; surface
// just <msg>, these strings end up verbatim in user-facing toasts
async function ipc<T>(call: Promise<T>): Promise<T> {
	try {
		return await call;
	} catch (e) {
		const raw = e instanceof Error ? e.message : String(e);
		throw new Error(raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, ''));
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

async function op(payload: Record<string, unknown>): Promise<void> {
	await ipc(requireNative().fsOp(payload));
}

export const createEntry = (path: string, type: 'file' | 'dir', content = '') => op({ action: 'create', path, type, content });
export const deleteEntry = (path: string) => op({ action: 'delete', path });
export const renameEntry = (from: string, to: string) => op({ action: 'rename', from, to });

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

// joins dir + rel using the dir's own separator so results match the native paths the scan/tree
// return; a mixed "C:\ws/sub" path would miss the exact-match file-tree highlight
export function joinPath(dir: string, rel: string): string {
	if (!dir) return rel;
	const sep = dir.includes('\\') ? '\\' : '/';
	const cleanRel = rel.replace(/^[\\/]+/, '').replace(/[\\/]/g, sep);
	return `${dir.replace(/[\\/]+$/, '')}${sep}${cleanRel}`;
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
