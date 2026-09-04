// Review comments as workspace state: the log, the threads resolved against the open file, and the
// actions the panel and the editor call.
//
// Kept out of WorkspaceView the way the other pipelines are - the view is already long, and none of
// this needs anything from it but the workspace root and a way to open a file.
import { CommentStore, relativeTo } from '$lib/comments/store.svelte';
import {
	buildAnchor,
	dialectOfPath,
	prepareLoose,
	resolveAnchor,
	resolveAnchorLoose,
	resolveAnchorLooseIn,
	toSourceAnchor,
	type CommentAnchor,
	type LooseHaystack
} from '$lib/comments/anchor';
import {
	anchorEvent,
	deleteEvent,
	deleteMessageEvent,
	editEvent,
	moveEvent,
	openEvent,
	placeEvent,
	replyEvent,
	resolveEvent,
	type CommentEvent,
	type CommentMessage,
	type CommentThread
} from '$lib/comments/log';
import { lineOf } from '$lib/comments/anchorLocate';
import { resolveAuthor, forgetAuthor } from '$lib/comments/author';
import type { CommentRange } from '$lib/editor/visual/extensions/comments';

type Deps = {
	/** absolute workspace root, or null before a folder is open */
	root: () => string | null;
	/** the Preferences name; blank falls back to git */
	preferredAuthor: () => string;
	/**
	 * The open file's CURRENT text. `reanchor` snapshots the text only when a file opens, which is
	 * fine for re-searching but wrong for building NEW anchors: in a shared session the buffer
	 * drifts under remote edits between open and gesture, and a quote sliced from the stale
	 * snapshot detaches the thread everywhere. Everything offset-shaped refreshes through this.
	 */
	activeText?: () => string;
	/** open a file and put the caret on a line (1-based) */
	openFileAt: (absPath: string, line: number) => void;
	/**
	 * Reveal a thread in the visual editor, if that is where the reader is and the thread is drawn
	 * there. False means "not from here" and the line jump is used instead.
	 */
	revealInVisual?: (id: string) => boolean;
	/**
	 * Hand a locally-made event to the session, if there is one.
	 *
	 * Called for everything this side originates and nothing it receives, so an event cannot loop:
	 * ingest() never publishes.
	 */
	publish?: (event: CommentEvent) => void;
};

export class CommentsController {
	readonly store = new CommentStore();
	/** the thread the reader is looking at, highlighted in both the panel and the editor */
	selected = $state<string | null>(null);
	/** where each thread on the ACTIVE file sits now; what the editor decorates */
	ranges = $state<CommentRange[]>([]);
	/** threads on the active file whose quote is gone from it */
	orphaned = $state<Set<string>>(new Set());
	/**
	 * Threads placed in the FILE but not drawable in the current view - the visual editor reports
	 * them after each placement pass. Distinct from orphaned on purpose: an orphan lost its text,
	 * these merely have no rendered text to sit on, and switching to source brings them back.
	 * Empty whenever the source editor is the view; it draws everything it can resolve.
	 */
	notVisible = $state<Set<string>>(new Set());
	/**
	 * Threads on the active file that were found, but whose surroundings changed (see
	 * ResolvedAnchor.weak). If the file holds their sentence twice the highlight may be on the
	 * other copy, so the panel asks the reader to check. Measured, never recorded: it is a fact
	 * about this text, and the next edit can change it either way.
	 */
	weak = $state<Set<string>>(new Set());
	/**
	 * A selection the reader has asked to comment on, before they have written anything.
	 *
	 * Held here rather than written straight to the log, because an empty thread on disk is a thread
	 * every other reader has to scroll past. The panel shows a composer for it and only the first
	 * message turns it into a real thread.
	 *
	 * Two shapes: source-mode offsets into `text` (the anchor is built at commit), or a ready-made
	 * anchor from the visual editor, whose positions mean nothing here.
	 */
	pending = $state<{ quote: string; from?: number; to?: number; anchor?: CommentAnchor } | null>(null);

	/** workspace-relative path of the file `ranges` was computed against */
	private file: string | null = null;
	private text = '';
	/** what we MEASURED on the open file, as opposed to what the log remembers about the others */
	private activeLost = new Set<string>();
	private activeHidden = new Set<string>();
	/** the reader is in the visual editor; see setVisualMode for why the hidden badge depends on it */
	private visual = false;
	/** a thread we are opening a different file for; selected once that file re-anchors */
	private pendingOpen: string | null = null;
	/** verdicts whose place event is still being written, keyed d:/h: + thread id; a second pass
	 *  landing before the first commit (a disk reload and a log refresh from one watcher event)
	 *  must not write the same line twice */
	private inFlight = new Map<string, boolean>();

	constructor(private readonly deps: Deps) {}

	get threads(): CommentThread[] {
		return this.store.threads;
	}
	get activeFile(): string | null {
		return this.file;
	}

	async load(root: string | null): Promise<void> {
		forgetAuthor();
		this.selected = null;
		this.pendingOpen = null;
		this.pending = null;
		this.activeHidden = new Set();
		this.activeLost = new Set();
		this.notVisible = new Set();
		this.weak = new Set();
		await this.store.load(root);
	}

	/**
	 * Re-resolve every thread on this file against its current text.
	 *
	 * Called when a file opens and when its text is replaced from outside - NOT on every keystroke.
	 * While the editor is live, CodeMirror maps the decorations through each transaction, which is
	 * exact; re-searching on top of that would fight it and could snap a range somewhere else
	 * mid-edit.
	 */
	reanchor(absPath: string | null, text: string): void {
		const root = this.deps.root();
		this.file = absPath && root ? relativeTo(root, absPath) : null;
		this.text = text;
		this.resolve();
	}

	/**
	 * Re-read the log after someone else wrote it - a `git pull`, a second window, an agent.
	 *
	 * Keeps the selection, unlike load(): this is the same project, just with more in it, and having
	 * the panel jump away because a colleague's comment arrived would be its own bug.
	 */
	async refresh(): Promise<void> {
		// A guest holds the session's log in memory against a sentinel root - re-reading would find
		// no file and clear it. Their updates arrive as events over the wire; disk is the host's.
		if (!this.store.writable) return;
		await this.store.reload();
		this.resolve();
	}

	/**
	 * Everything the panel should badge as detached: what we just measured on the open file, plus
	 * what the log remembers about every other file.
	 *
	 * The live answer WINS for the open file. A recorded status is only ever the last thing some
	 * Texpile saw; for the file in front of the reader we have the text itself, so the recording is
	 * the weaker evidence and must not survive next to it.
	 */
	private applyOrphans(): void {
		const merged = new Set(this.activeLost);
		for (const t of this.store.threads) {
			if (t.file === this.file) continue; // measured above, not remembered
			if (t.detached) merged.add(t.id);
		}
		this.orphaned = merged;
		// nothing is "not in this view" while the view is source; see setVisualMode
		const hidden = new Set<string>();
		if (this.visual) {
			for (const id of this.activeHidden) hidden.add(id);
			for (const t of this.store.threads) {
				if (t.file === this.file) continue; // measured above, not remembered
				if (t.hidden) hidden.add(t.id);
			}
		}
		this.notVisible = hidden;
	}

	/**
	 * Which editor the reader is looking at, because "not in this view" is a claim about the view.
	 *
	 * In source mode NOTHING is hidden - the source editor draws every thread it can resolve - so the
	 * badge and its "switch to source mode to see it" note are simply false there, for the open file
	 * and for the remembered ones alike. Gating on the mode is what stops the panel telling a reader
	 * already in source to go to source.
	 *
	 * Leaving visual also drops what this window measured, and deliberately records NOTHING: source
	 * has not discovered those threads became drawable, it has stopped looking, and writing
	 * `hidden: false` would overwrite a true observation with the absence of one.
	 */
	setVisualMode(visual: boolean): void {
		if (this.visual === visual) return;
		this.visual = visual;
		if (!visual) this.activeHidden = new Set();
		this.applyOrphans();
	}

	/** the live text when the view provides it, else the last reanchor snapshot */
	private fresh(): string {
		const t = this.deps.activeText?.();
		if (t !== undefined) this.text = t;
		return this.text;
	}

	/** the open file's markup family, for the normalized quote search */
	private dialect() {
		return dialectOfPath(this.file ?? '');
	}

	/** recompute the active file's ranges from the current log and text */
	private resolve(): void {
		if (!this.file) {
			this.ranges = [];
			this.activeLost = new Set();
			this.weak = new Set();
			this.applyOrphans();
			return;
		}
		const text = this.fresh();
		const ranges: CommentRange[] = [];
		const lost = new Set<string>();
		const weak = new Set<string>();
		// normalized once for the whole file, and only if something actually misses the fast path
		let hay: LooseHaystack | null = null;
		for (const t of this.store.forFile(this.file)) {
			// loose second: an anchor authored in the visual editor is rendered-dialect, and only the
			// normalized search can carry it back onto source with its wraps, escapes and ligatures
			let hit = resolveAnchor(text, t.anchor);
			if (!hit) {
				hay ??= prepareLoose(text, this.dialect());
				hit = resolveAnchorLooseIn(hay, t.anchor);
			}
			if (hit) {
				ranges.push({ id: t.id, from: hit.from, to: hit.to, resolved: t.resolved });
				if (hit.weak) weak.add(t.id);
			} else lost.add(t.id);
		}
		this.ranges = ranges;
		this.activeLost = lost;
		this.weak = weak;
		this.applyOrphans();
		void this.recordDetached(this.file, lost);
		if (this.pendingOpen) {
			const target = this.pendingOpen;
			this.pendingOpen = null;
			this.selected = target;
			this.scrollTo(target);
		}
	}

	/**
	 * Write back what we just measured, for the threads whose recorded status was wrong or missing.
	 *
	 * ONLY the differences. Two reasons, and the second is not optional: appending on every pass
	 * would grow a committed file every time anyone opened a folder, and - because appending
	 * reassigns `store.threads`, which resolve() reads - it would re-enter resolve() and append
	 * again, forever. Writing only deltas makes the second pass find nothing to say and stop.
	 */
	private async recordDetached(file: string, lost: Set<string>): Promise<void> {
		if (!this.store.writable) return;
		const stale = this.store.forFile(file).filter((t) => asFlag(t.detached) !== lost.has(t.id));
		await this.recordPlacement('d:', stale, lost, (t) => ({ thread: t.id, detached: lost.has(t.id) }));
	}

	/** the write behind recordDetached and recordHidden, skipping verdicts already on their way */
	private async recordPlacement(
		key: 'd:' | 'h:',
		stale: CommentThread[],
		lost: Set<string>,
		fields: (t: CommentThread) => { thread: string; detached?: boolean; hidden?: boolean }
	): Promise<void> {
		const fresh = stale.filter((t) => this.inFlight.get(key + t.id) !== lost.has(t.id));
		if (fresh.length === 0) return;
		for (const t of fresh) this.inFlight.set(key + t.id, lost.has(t.id));
		try {
			const by = await this.author();
			const at = new Date().toISOString();
			await this.commit(...fresh.map((t) => placeEvent({ ...fields(t), by, at })));
		} finally {
			for (const t of fresh) this.inFlight.delete(key + t.id);
		}
	}

	/**
	 * The visual editor reporting which threads it could not draw, for the document it just placed.
	 *
	 * Same delta discipline as recordDetached, and the same reason. `file` is passed rather than read
	 * from `this` because the report can land a beat after a file switch.
	 */
	async recordHidden(file: string, lost: Set<string>): Promise<void> {
		this.activeHidden = file === this.file ? lost : new Set();
		this.applyOrphans();
		if (!this.store.writable) return;
		const stale = this.store.forFile(file).filter((t) => asFlag(t.hidden) !== lost.has(t.id));
		await this.recordPlacement('h:', stale, lost, (t) => ({ thread: t.id, hidden: lost.has(t.id) }));
	}

	/**
	 * The reader selected text and asked to comment; the panel takes it from here.
	 *
	 * The anchor is built NOW, against the live text the offsets refer to - not at commit. The
	 * composer stays open while collaborators keep editing, and offsets held raw across that
	 * window pointed into a document that no longer existed; the anchor's quote and context
	 * survive it, exactly as the visual editor's ready-made anchors do.
	 */
	beginAdd(from: number, to: number): void {
		if (!this.file || to <= from) return;
		const text = this.fresh();
		if (to > text.length) return;
		this.pending = { from, to, quote: text.slice(from, to), anchor: buildAnchor(text, from, to) };
		this.selected = null;
	}

	/**
	 * The visual editor's version of beginAdd: it hands over a rendered-dialect anchor because its
	 * own positions mean nothing to anyone else. Converted to SOURCE dialect right here, at the
	 * gesture, against the live text - the source file is the source of truth, and a stored quote
	 * sliced from it resolves exactly in the source editor and survives the loose search back into
	 * every visual view. Precise when the quote crosses only markup, the enclosing block when it
	 * crossed an atom, detached only when nothing at all is locatable (see toSourceAnchor).
	 */
	beginAddAnchored(anchor: CommentAnchor | null): void {
		if (!this.file || !anchor) return;
		const converted = toSourceAnchor(this.fresh(), this.dialect(), anchor);
		this.pending = { quote: converted.anchor.quote, anchor: converted.anchor };
		this.selected = null;
	}

	cancelAdd(): void {
		this.pending = null;
	}

	/** turn the pending selection into a thread; no-op if there is nothing to write */
	async commitAdd(body: string): Promise<void> {
		const p = this.pending;
		if (!p) return;
		this.pending = null;
		if (!p.anchor || !this.file) return;
		const id = await this.openOn(this.file, p.anchor, body);
		if (id) this.selected = id;
	}

	/**
	 * Open a thread on `file` at a ready-made anchor: the panel's commit, and the MCP tools' way in.
	 *
	 * On the active file the new thread gets its highlight now, re-resolved rather than pushed from
	 * the gesture's offsets: the composer window may have seen remote edits, and the search lands on
	 * the text wherever it sits NOW (visual-editor anchors are source-dialect by then too, see
	 * beginAddAnchored). Returns the id, or null when there was nothing to write.
	 */
	async openOn(file: string, anchor: CommentAnchor, body: string, by?: string): Promise<string | null> {
		const root = this.deps.root();
		if (!root || !body.trim()) return null;
		const id = crypto.randomUUID();
		await this.commit(openEvent({ id, file, by: await this.author(by), body: body.trim(), anchor, at: new Date().toISOString() }));
		if (file === this.file) this.placeOne(id, anchor, false);
		return id;
	}

	/**
	 * Re-pin a thread to `anchor` in `file`, after an edit rewrote the text it sat on. An event,
	 * not a rewrite of the open line, same as move: the log is append-only.
	 */
	async moveAnchor(thread: CommentThread, anchor: CommentAnchor, file: string, by?: string): Promise<void> {
		const moved = file !== thread.file;
		await this.commit(
			anchorEvent({ thread: thread.id, anchor, file: moved ? file : undefined, by: await this.author(by), at: new Date().toISOString() })
		);
		if (file === this.file) this.placeOne(thread.id, anchor, thread.resolved);
		else if (thread.file === this.file) this.dropRange(thread.id);
	}

	/** returns the new message's id, or null if there was nothing to write */
	async reply(thread: CommentThread, body: string, by?: string): Promise<string | null> {
		if (!body.trim()) return null;
		const id = crypto.randomUUID();
		await this.commit(replyEvent({ id, thread: thread.id, by: await this.author(by), body: body.trim(), at: new Date().toISOString() }));
		return id;
	}

	async setResolved(thread: CommentThread, resolved: boolean, by?: string): Promise<void> {
		await this.commit(resolveEvent({ thread: thread.id, by: await this.author(by), resolved, at: new Date().toISOString() }));
		this.ranges = this.ranges.map((r) => (r.id === thread.id ? { ...r, resolved } : r));
	}

	/** one thread's range on the active file, from the live text; lost there when the quote is not */
	private placeOne(id: string, anchor: CommentAnchor, resolved: boolean): void {
		const text = this.fresh();
		const hit = resolveAnchor(text, anchor) ?? resolveAnchorLoose(text, anchor, this.dialect());
		const rest = this.ranges.filter((r) => r.id !== id);
		this.ranges = hit ? [...rest, { id, from: hit.from, to: hit.to, resolved }] : rest;
		if (hit) this.activeLost.delete(id);
		else this.activeLost.add(id);
		this.setWeak(id, hit?.weak === true);
		this.applyOrphans();
	}

	/** a thread that left the active file, by deletion or by moving elsewhere */
	private dropRange(id: string): void {
		this.ranges = this.ranges.filter((r) => r.id !== id);
		this.activeLost.delete(id);
		this.setWeak(id, false);
		this.applyOrphans();
		if (this.selected === id) this.selected = null;
	}

	private setWeak(id: string, on: boolean): void {
		if (this.weak.has(id) === on) return;
		const next = new Set(this.weak);
		if (on) next.add(id);
		else next.delete(id);
		this.weak = next;
	}

	/** rewrite one message. Not restricted to your own: the log is a file anyone can edit anyway */
	async editMessage(message: CommentMessage, body: string): Promise<void> {
		if (!body.trim() || body.trim() === message.body) return;
		await this.commit(editEvent({ message: message.id, body: body.trim(), by: await this.author(), at: new Date().toISOString() }));
	}

	/** drop one message; the fold drops the thread with it if that was the last of it */
	async removeMessage(thread: CommentThread, message: CommentMessage): Promise<void> {
		await this.commit(deleteMessageEvent({ message: message.id, by: await this.author(), at: new Date().toISOString() }));
		if (thread.messages.length <= 1) {
			this.ranges = this.ranges.filter((r) => r.id !== thread.id);
			if (this.selected === thread.id) this.selected = null;
		}
	}

	async remove(thread: CommentThread): Promise<void> {
		await this.commit(deleteEvent({ thread: thread.id, by: await this.author(), at: new Date().toISOString() }));
		this.ranges = this.ranges.filter((r) => r.id !== thread.id);
		if (this.selected === thread.id) this.selected = null;
	}

	/** reveal a thread: scroll to it here, or open the file it is on and scroll once it lands */
	open(thread: CommentThread): void {
		this.selected = thread.id;
		if (thread.file === this.file) {
			this.scrollTo(thread.id);
			return;
		}
		const root = this.deps.root();
		if (!root) return;
		this.pendingOpen = thread.id;
		this.deps.openFileAt(`${root}/${thread.file}`, 1);
	}

	/** everything this side originates: state, disk if there is any, then the session */
	private async commit(...events: CommentEvent[]): Promise<void> {
		await this.store.append(...events);
		for (const e of events) this.deps.publish?.(e);
	}

	/**
	 * An event from someone else in the session.
	 *
	 * Never publishes - that is what stops a rebroadcast bouncing forever - and never re-anchors the
	 * whole file. A full reanchor would re-search against `text`, which is only refreshed when a file
	 * opens, so anything typed since would push every OTHER thread onto stale offsets and throw away
	 * the exact mapping CodeMirror has been keeping. Only the range this event is about is touched.
	 */
	async ingest(event: CommentEvent): Promise<void> {
		// The host echoes a guest's own event back (it broadcasts to everyone, the sender
		// included). A thread we already hold is that echo: appending is harmless (foldLog
		// dedupes by id) but re-resolving is NOT - a miss here badged the author's own fresh
		// comment as detached on their own screen.
		if (event.t === 'open' && this.store.threads.some((t) => t.id === event.id)) return;
		await this.store.append(event);
		if (event.t === 'open' && event.file === this.file) {
			this.placeOne(event.id, event.anchor, false);
		} else if (event.t === 'resolve') {
			this.ranges = this.ranges.map((r) => (r.id === event.thread ? { ...r, resolved: event.resolved } : r));
		} else if (event.t === 'delete') {
			this.dropRange(event.thread);
		} else if (event.t === 'anchor') {
			const t = this.store.threads.find((x) => x.id === event.thread);
			if (t && t.file === this.file) this.placeOne(t.id, t.anchor, t.resolved);
			else this.dropRange(event.thread);
		}
	}

	/**
	 * A file or directory was renamed/moved in the tree: its threads follow, via a `move` event.
	 *
	 * An event rather than a rewrite of the open lines, because the log is append-only - that is
	 * what lets git merge it - and because undo replays the rename backwards, which then simply
	 * appends the reverse move. Only written when a thread is actually affected, so renaming files
	 * nobody commented on does not grow the log. External renames (vim, git mv) cannot be seen from
	 * here; those threads orphan, which the panel already explains.
	 */
	async fileMoved(fromAbs: string, toAbs: string): Promise<void> {
		const root = this.deps.root();
		if (!root) return;
		const from = relativeTo(root, fromAbs);
		const to = relativeTo(root, toAbs);
		if (from === to) return;
		const affected = this.store.threads.some((t) => t.file === from || t.file.startsWith(from + '/'));
		if (!affected) return;
		await this.commit(moveEvent({ from, to, by: await this.author(), at: new Date().toISOString() }));
	}

	/** a guest's catch-up: the host's whole log, served over the blob channel on join */
	adopt(text: string, absPath: string | null, docText: string): void {
		this.store.adoptLog(text);
		this.reanchor(absPath, docText);
	}

	private scrollTo(id: string): void {
		// The visual editor first, when that is where the reader is: it has already placed this thread
		// on the exact characters it covers, whereas the line jump below has to push a source line back
		// through the block map, which is block-granular - so a comment on the last clause of a long
		// paragraph landed at the top of the paragraph. Falls through when the reader is in source, or
		// when this thread is one the visual view could not draw.
		if (this.deps.revealInVisual?.(id)) return;
		const hit = this.ranges.find((r) => r.id === id);
		// an orphaned thread has nowhere to scroll to; the panel says so rather than jumping to line 1
		if (hit) this.deps.openFileAt(`${this.deps.root()}/${this.file}`, lineOf(this.text, hit.from));
	}

	/** who signs an event: a caller's own name (an MCP client), else this workspace's author */
	private author(by?: string): Promise<string> {
		const own = by?.trim();
		return own ? Promise.resolve(own) : resolveAuthor(this.deps.root(), this.deps.preferredAuthor());
	}
}

/**
 * An unrecorded status read as "fine", which is what makes browsing a project free.
 *
 * The panel only ever asks `if (t.detached)`, so "nobody has looked" and "looked, nothing wrong"
 * produce the same row. Telling them apart on disk would therefore buy nothing and cost a line per
 * thread the first time anyone opens each file - a committed log gaining hundreds of entries that
 * all say nothing is wrong. So only the interesting answer is written: `true` when the text has
 * gone, and `false` only to CORRECT a recorded `true` that is no longer so.
 */
function asFlag(v: boolean | undefined): boolean {
	return v === true;
}
