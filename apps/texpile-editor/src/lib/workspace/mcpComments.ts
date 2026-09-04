// Renderer end of the MCP comment tools: every thread with where it sits NOW, and the log-only
// writes (open, reply, resolve, re-anchor). Quotes are located here, against the text the editor
// shows and with the search the editor itself uses, so a tool and the panel cannot disagree about
// what counts as found
import { workspaceRoot, isDirty } from './workspaceStore';
import { readTextFile, toLf } from './fileSystem';
import { relativeTo } from '$lib/comments/store.svelte';
import { inOpenTree, resolveInWorkspace } from './mcpWorkspacePath';
import { fileKind, hasVisualMode, isRawTextKind } from './documentBuffer.svelte';
import { dialectOfPath, prepareLoose, resolveAnchor, resolveAnchorLooseIn, type LooseHaystack } from '$lib/comments/anchor';
import { lineOf, locateQuote } from '$lib/comments/anchorLocate';
import type { CommentsController } from './commentsController.svelte';
import type { CommentThread } from '$lib/comments/log';

export type McpCommentDeps = {
	comments: CommentsController;
	/** the open file's absolute path */
	getLoadedPath(): string | null;
	/** the live buffer for whichever kind is open */
	getBuffer(): string;
	/** fold an outside write to the open file into the buffer, so a fresh edit is searchable */
	adoptDiskChange(): Promise<void>;
};

type Args = Record<string, unknown>;
type FileText = { text: string; unsaved: boolean };
type Refusal = { ok: false; reason: string } & Args;

/** shown as the author when the caller gives no name; a name of its own, never the user's */
const DEFAULT_BY = 'AI assistant';
const NO_LOG = 'this window keeps no comment log (a shared-session guest, or a single file)';

function str(v: unknown): string | undefined {
	return typeof v === 'string' ? v : undefined;
}
function num(v: unknown): number | undefined {
	return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined;
}
function fail(reason: string, extra: Args = {}): Refusal {
	return { ok: false, reason, ...extra };
}
function author(a: Args): string {
	return str(a.by)?.trim() || DEFAULT_BY;
}

/** workspace-relative with posix separators, the form thread.file is stored in */
function relOf(v: unknown): string | null {
	const s = str(v)?.trim().replace(/\\/g, '/').replace(/^\.\//, '');
	return s || null;
}

function threadOf(ctl: CommentsController, id: unknown): CommentThread | null {
	return ctl.threads.find((t) => t.id === id) ?? null;
}

/** the text a thread on `rel` resolves against: the live buffer for the open file, disk otherwise */
async function textOf(deps: McpCommentDeps, rel: string): Promise<FileText | null> {
	const root = workspaceRoot.current;
	if (!root) return null;
	const loaded = deps.getLoadedPath();
	if (loaded && relativeTo(root, loaded) === rel) {
		// a clean buffer picks up an outside write the watcher has not delivered yet; a dirty one is
		// left alone, since adopting would raise the conflict modal from inside a tool call
		if (!isDirty.current) await deps.adoptDiskChange();
		return { text: deps.getBuffer(), unsaved: isDirty.current };
	}
	const abs = resolveInWorkspace(rel);
	if (!abs) return null;
	try {
		return { text: toLf(await readTextFile(abs)), unsaved: false };
	} catch {
		return null;
	}
}

/** a file the caller may pin a thread to, with its text */
async function readTarget(deps: McpCommentDeps, rel: string): Promise<{ ok: true; src: FileText } | Refusal> {
	const abs = resolveInWorkspace(rel);
	if (!abs) return fail('path is outside this workspace');
	if (!inOpenTree(abs)) return fail('no such file in this workspace');
	// the same kinds the editor itself comments on; a PDF's bytes are not a document
	const kind = fileKind(abs);
	if (!hasVisualMode(kind) && !isRawTextKind(kind)) return fail('comments go on text files only (.tex, .md, .typ, .bib, plain text)');
	const src = await textOf(deps, rel);
	if (!src) return fail('the file could not be read');
	return { ok: true, src };
}

/** locateQuote with the caller's arguments, plus the note a miss on a dirty buffer needs */
function locate(src: FileText, rel: string, a: Args) {
	const quote = str(a.quote);
	if (!quote) return fail('quote is required');
	const r = locateQuote(src.text, { quote, prefix: str(a.prefix), suffix: str(a.suffix), line: num(a.line) }, dialectOfPath(rel));
	if (r.ok) return r;
	const reason = src.unsaved
		? `${r.reason} (the file is open with unsaved changes, so the search ran against the editor buffer, not disk; see get_unsaved)`
		: r.reason;
	return fail(reason, r.candidates ? { candidates: r.candidates } : {});
}

type ThreadReport = {
	id: string;
	file: string;
	quote: string;
	resolved: boolean;
	fileExists: boolean;
	placed: ReturnType<typeof place>;
	unsaved: boolean;
	messages: { id: string; at: string; by: string; body: string; editedAt: string | null }[];
};

/** where a thread sits in `text`, or null when its quote is gone */
function place(text: string, t: CommentThread, hay: () => LooseHaystack) {
	const hit = resolveAnchor(text, t.anchor) ?? resolveAnchorLooseIn(hay(), t.anchor);
	if (!hit) return null;
	return {
		line: lineOf(text, hit.from),
		endLine: lineOf(text, Math.max(hit.from, hit.to - 1)),
		from: hit.from,
		to: hit.to,
		// weak: found, but the words around it changed; if the sentence repeats this may be another copy
		match: hit.exact ? 'exact' : hit.weak ? 'weak' : 'relocated'
	};
}

export async function commentsPayload(
	deps: McpCommentDeps,
	a: Args
): Promise<Refusal | { ok: true; total: number; open: number; threads: ThreadReport[] }> {
	const ctl = deps.comments;
	if (!workspaceRoot.current) return fail('no folder is open');
	if (!ctl.store.writable) return fail(NO_LOG);
	const filter = relOf(a.path);
	if (filter && !resolveInWorkspace(filter)) return fail('path is outside this workspace');
	const includeResolved = a.includeResolved === true;
	// counts follow the path filter, or a one-file reply reads as a truncated workspace one
	const inScope = ctl.threads.filter((t) => !filter || t.file === filter);
	const wanted = inScope.filter((t) => includeResolved || !t.resolved);
	// each file read and normalized once, however many threads sit on it
	const texts = new Map<string, FileText | null>();
	const hays = new Map<string, LooseHaystack>();
	function hayOf(file: string, text: string): LooseHaystack {
		let h = hays.get(file);
		if (!h) {
			h = prepareLoose(text, dialectOfPath(file));
			hays.set(file, h);
		}
		return h;
	}
	const threads: ThreadReport[] = [];
	for (const t of wanted) {
		if (!texts.has(t.file)) texts.set(t.file, await textOf(deps, t.file));
		const src = texts.get(t.file) ?? null;
		threads.push({
			id: t.id,
			file: t.file,
			quote: t.anchor.quote,
			resolved: t.resolved,
			fileExists: src !== null,
			// null means detached: the quote is gone from the file, or the file is gone
			placed: src ? place(src.text, t, () => hayOf(t.file, src.text)) : null,
			// the open file with unsaved changes: lines refer to the buffer, not to disk
			unsaved: src?.unsaved ?? false,
			messages: t.messages.map((m) => ({ id: m.id, at: m.at, by: m.by, body: m.body, editedAt: m.editedAt ?? null }))
		});
	}
	return { ok: true, total: inScope.length, open: inScope.filter((t) => !t.resolved).length, threads };
}

export async function addCommentPayload(deps: McpCommentDeps, a: Args) {
	const ctl = deps.comments;
	if (!workspaceRoot.current) return fail('no folder is open');
	if (!ctl.store.writable) return fail(NO_LOG);
	const rel = relOf(a.path);
	if (!rel) return fail('path is required');
	const body = str(a.body)?.trim();
	if (!body) return fail('body is required');
	const target = await readTarget(deps, rel);
	if (!target.ok) return target;
	const loc = locate(target.src, rel, a);
	if (!loc.ok) return loc;
	const id = await ctl.openOn(rel, loc.anchor, body, author(a));
	if (!id) return fail('the editor refused to open the thread');
	return { ok: true, thread: id, file: rel, line: lineOf(target.src.text, loc.from), quote: loc.anchor.quote };
}

export async function reanchorCommentPayload(deps: McpCommentDeps, a: Args) {
	const ctl = deps.comments;
	if (!workspaceRoot.current) return fail('no folder is open');
	if (!ctl.store.writable) return fail(NO_LOG);
	const thread = threadOf(ctl, a.thread);
	if (!thread) return fail('no thread with that id; get_comments lists them');
	const rel = relOf(a.path) ?? thread.file;
	const target = await readTarget(deps, rel);
	if (!target.ok) return target;
	const loc = locate(target.src, rel, a);
	if (!loc.ok) return loc;
	await ctl.moveAnchor(thread, loc.anchor, rel, author(a));
	return { ok: true, thread: thread.id, file: rel, line: lineOf(target.src.text, loc.from), quote: loc.anchor.quote };
}

export async function replyCommentPayload(deps: McpCommentDeps, a: Args) {
	const ctl = deps.comments;
	if (!ctl.store.writable) return fail(NO_LOG);
	const thread = threadOf(ctl, a.thread);
	if (!thread) return fail('no thread with that id; get_comments lists them');
	const body = str(a.body)?.trim();
	if (!body) return fail('body is required');
	const id = await ctl.reply(thread, body, author(a));
	return { ok: true, thread: thread.id, message: id };
}

export async function resolveCommentPayload(deps: McpCommentDeps, a: Args) {
	const ctl = deps.comments;
	if (!ctl.store.writable) return fail(NO_LOG);
	const thread = threadOf(ctl, a.thread);
	if (!thread) return fail('no thread with that id; get_comments lists them');
	const resolved = a.resolved !== false;
	await ctl.setResolved(thread, resolved, author(a));
	return { ok: true, thread: thread.id, resolved };
}
