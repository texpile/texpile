// The workspace's comment log: read it, fold it, append to it.
//
// Lives at .texpile/comments.jsonl. That path is invisible in the file tree - fsService's skipDir
// drops every dot-directory from the walk - so it needs no ignore-list entry. It is NOT invisible
// to the watcher: fsWatch exempts .texpile from the same rule precisely so a log arriving by
// `git pull` reaches reload() while the folder is open.
//
// This is the first thing Texpile writes into a user's project. Everything else kept per folder -
// main file, compile command - is localStorage keyed by root path, because it is personal. Comments
// are the opposite: they exist to be read by someone else, so they belong in the project and in the
// commit.
import { readTextFile, writeTextFile } from '$lib/workspace/fileSystem';
import { ensureTexpileIgnore, texpilePath } from '$lib/workspace/texpileDir';
import { foldLog, parseLog, type CommentEvent, type CommentThread } from './log';
import { collapseStaged, thrownBack } from './stagedEvents';

function keptLines(text: string): string[] {
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => {
			if (!line.startsWith('{')) return false;
			try {
				const parsed: unknown = JSON.parse(line);
				return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
			} catch {
				return false;
			}
		});
}

function threadOf(e: CommentEvent): string {
	return e.t === 'open' ? e.id : 'thread' in e ? e.thread : '';
}

/** a session's copy of the log, which every side reads in the same order */
export type CommentLogShare = {
	lines(): string[];
	/** each change swaps the last copy of a line for its replacement where it stands (null drops it), then `add`
	 *  goes at the end, all as one change */
	edit(changes: [string, string | null][], add: string[]): void;
};

export class CommentStore {
	/** every thread in the workspace, in the order they were opened */
	threads = $state<CommentThread[]>([]);
	/** the workspace this log belongs to; null before the first load */
	root = $state<string | null>(null);
	loading = $state(false);

	private events: CommentEvent[] = [];
	/** the log verbatim, so appending never has to re-serialize anything it did not parse */
	private lines: string[] = [];
	private staged: CommentEvent[] = [];
	private share: CommentLogShare | null = null;
	/** while shared: this side's staged events, already in the shared log but not on disk */
	private unsaved: string[] = [];
	private parsed = new Map<string, CommentEvent | null>();
	private writing: Promise<void> = Promise.resolve();
	/** the lines this side last read on disk or wrote there */
	private onDisk = new Set<string>();
	private writesQueued = 0;
	private writesDone = 0;
	/** each thread staged since its file was last saved, as it stood before, null for one staging made: a write of
	 *  the log takes staged events early (a reply), and what of it the typing thrown away had changed goes back */
	private beforeTyping = new Map<string, CommentThread | null>();

	/** stale-load guard: reloads fire on every save (the fs watcher reports our own writes) and
	 *  an older read landing after a newer one would publish stale threads */
	private loadSeq = 0;

	/** null for a guest, whose root is a sentinel rather than a path - see texpilePath */
	private path(root: string): string | null {
		return texpilePath(root, 'comments.jsonl');
	}

	/** point the store at a workspace and read its log; a missing file is an empty log, not an error.
	 *  The store is NOT cleared while the read is in flight: it used to be, and since every save
	 *  re-runs this through the fs watcher, the panel blanked, the topbar badge blinked out and the
	 *  editor's comment highlights flickered on each save. The old threads stay up until the fresh
	 *  fold replaces them in one step. */
	async load(root: string | null): Promise<void> {
		const my = ++this.loadSeq;
		if (root !== this.root) {
			this.staged = [];
			this.lines = [];
			this.events = [];
			this.onDisk = new Set();
			this.beforeTyping.clear();
		}
		this.root = root;
		const path = root ? this.path(root) : null;
		if (!path) {
			this.adoptLog('');
			return;
		}
		this.loading = true;
		// a write of ours under way can make the read come back short, which says nothing about what was taken out
		const queued = this.writesQueued;
		const wasOnDisk = queued === this.writesDone ? this.onDisk : null;
		try {
			const text = await readTextFile(path);
			if (my !== this.loadSeq) return;
			this.adoptLog(text, queued === this.writesQueued ? wasOnDisk : null);
		} catch {
			// no log yet is the normal state for a project nobody has commented on
			if (my === this.loadSeq) this.adoptLog('');
		} finally {
			if (my === this.loadSeq) this.loading = false;
		}
	}

	/** re-read from disk, for a pull or another window; CommentsController.refresh drives it */
	reload(): Promise<void> {
		return this.load(this.root);
	}

	/**
	 * Append events, and write the log back if this workspace has one.
	 *
	 * The state always advances; only the write is conditional. That is what lets a guest hold the
	 * session's comments in memory with no disk at all - their root is a sentinel, not a path, and
	 * the file lives on the host.
	 *
	 * Read-modify-write rather than a true append, because the fs bridge only offers whole-file
	 * writes. Two Texpile windows on one folder could therefore lose an event; a real O_APPEND
	 * needs its own IPC and is the fix if that ever matters. Concurrent authors on different
	 * machines are already handled - that is what the log format is for.
	 */
	async append(...events: CommentEvent[]): Promise<void> {
		if (this.share) {
			if (events.length === 0 && this.unsaved.length === 0) return;
			this.save(events);
			return this.write();
		}
		if (events.length === 0 && this.staged.length === 0) return;
		const written = [...collapseStaged(this.staged), ...events];
		this.staged = [];
		this.events = [...this.events, ...written];
		this.lines = [...this.lines, ...written.map((e) => JSON.stringify(e))];
		this.threads = foldLog(this.events);
		return this.write();
	}

	stage(...events: CommentEvent[]): void {
		if (events.length === 0) return;
		for (const id of events.map(threadOf))
			if (!this.beforeTyping.has(id)) this.beforeTyping.set(id, this.threads.find((t) => t.id === id) ?? null);
		if (this.share) return this.stageShared(events);
		this.staged = [...this.staged, ...events];
		this.threads = foldLog([...this.events, ...this.staged]);
	}

	get hasStaged(): boolean {
		return this.share ? this.unsaved.length > 0 : this.staged.length > 0;
	}

	/** staged for `file`, or written early since its last save */
	hasStagedFor(file: string): boolean {
		const ids = this.idsOn(file);
		return [...this.pending().map(threadOf), ...this.beforeTyping.keys()].some((id) => ids.has(id));
	}

	/** `file` is on disk as it was staged */
	saved(file: string): void {
		for (const id of this.idsOn(file)) this.beforeTyping.delete(id);
	}

	/** what puts back the threads on `file` a write took early of staged events now discarded */
	takeBack(file: string, by: string): CommentEvent[] {
		const ids = this.idsOn(file);
		const before = new Map([...this.beforeTyping].filter(([id]) => ids.has(id)));
		for (const id of before.keys()) this.beforeTyping.delete(id);
		return thrownBack(before, this.threads, by);
	}

	discardStaged(file: string): boolean {
		const ids = this.idsOn(file);
		if (this.share) {
			const gone = this.unsaved.filter((line) => ids.has(threadOf(this.parse(line)!)));
			if (gone.length === 0) return false;
			this.share.edit(
				gone.map((line) => [line, null]),
				[]
			);
			this.follow();
			return true;
		}
		const kept = this.staged.filter((e) => !ids.has(threadOf(e)));
		if (kept.length === this.staged.length) return false;
		this.staged = kept;
		this.threads = foldLog([...this.events, ...this.staged]);
		return true;
	}

	private pending(): CommentEvent[] {
		return this.share ? this.unsaved.map((line) => this.parse(line)!) : this.staged;
	}

	private idsOn(file: string): Set<string> {
		const ids = new Set(this.threads.filter((t) => t.file === file).map((t) => t.id));
		for (const e of this.pending()) if (e.t === 'open' && e.file === file) ids.add(e.id);
		return ids;
	}

	/** seeded if absent, never over one the user has edited; shared with the config writer */
	private async ensureIgnore(): Promise<void> {
		if (this.root) await ensureTexpileIgnore(this.root);
	}

	/** one write at a time, each of the log as it is by then, so a slow write never lands over a newer one */
	private write(): Promise<void> {
		const path = this.root ? this.path(this.root) : null;
		if (!path) return Promise.resolve();
		this.writesQueued++;
		const done = this.writing.then(async () => {
			await this.ensureIgnore();
			const text = this.serialize();
			await writeTextFile(path, text);
			if (this.root && this.path(this.root) === path) this.onDisk = new Set(text.split('\n'));
		});
		this.writing = done
			.catch(() => undefined)
			.finally(() => {
				this.writesDone++;
			});
		return done;
	}

	/** a log read from disk; while shared, lines someone added there (a pull, another window) join the session */
	adoptLog(text: string, wasOnDisk: Set<string> | null = null): void {
		if (this.share) {
			const present = new Set(this.share.lines());
			const added = keptLines(text).filter((line) => !present.has(line));
			if (added.length) this.share.edit([], added);
			this.follow();
			return;
		}
		const served = keptLines(text);
		const known = new Set(served);
		this.lines = [...served, ...this.lines.filter((line) => !known.has(line) && !wasOnDisk?.has(line))];
		this.onDisk = known;
		this.events = parseLog(this.lines.join('\n'));
		this.threads = foldLog([...this.events, ...this.staged]);
	}

	/** what goes to disk: while shared, the session's log less this side's unsaved lines */
	serialize(): string {
		if (this.share) return withoutLast(this.lines, this.unsaved).join('\n') + '\n';
		return [...this.lines, ...collapseStaged(this.staged).map((e) => JSON.stringify(e))].join('\n') + '\n';
	}

	/**
	 * Follow a session's log instead of keeping one's own. A host puts its log and staged events in
	 * first; a guest takes what is there.
	 */
	startSharing(share: CommentLogShare, seed: boolean): void {
		this.share = share;
		if (seed) {
			const present = new Set(share.lines());
			const staged = collapseStaged(this.staged).map((e) => JSON.stringify(e));
			share.edit([], [...this.lines.filter((line) => !present.has(line)), ...staged]);
			this.unsaved = staged;
			this.staged = [];
		}
		this.follow();
	}

	/** back to a log of its own: what the session had, with this side's unsaved lines staged again */
	stopSharing(): void {
		if (!this.share) return;
		this.staged = this.pending();
		this.lines = withoutLast(this.lines, this.unsaved);
		this.events = this.lines.flatMap((line) => this.parse(line) ?? []);
		this.share = null;
		this.unsaved = [];
		this.parsed.clear();
		this.threads = foldLog([...this.events, ...this.staged]);
	}

	/** re-read the session's log after a change to it */
	follow(): void {
		if (!this.share) return;
		this.lines = this.share.lines();
		const parsed = new Map<string, CommentEvent | null>();
		for (const line of this.lines) parsed.set(line, this.parse(line));
		this.parsed = parsed;
		this.unsaved = this.unsaved.filter((line) => parsed.has(line));
		this.events = this.lines.flatMap((line) => parsed.get(line) ?? []);
		this.threads = foldLog(this.events);
	}

	/** write what someone else added to the session's log, if this side keeps the file */
	flush(): Promise<void> {
		return this.share ? this.write() : Promise.resolve();
	}

	private parse(line: string): CommentEvent | null {
		const known = this.parsed.get(line);
		if (known !== undefined) return known;
		const event = parseLog(line)[0] ?? null;
		this.parsed.set(line, event);
		return event;
	}

	// a newer anchor of a thread replaces the one still unsaved, as collapseStaged would on disk:
	// otherwise the session keeps every keystroke of a suggestion being typed
	private stageShared(events: CommentEvent[]): void {
		const unsaved = [...this.unsaved];
		const added: string[] = [];
		const gone: string[] = [];
		for (let e of events) {
			if (e.t === 'anchor') {
				const thread = e.thread;
				const at = unsaved.findLastIndex((line) => {
					const p = this.parse(line);
					return p?.t === 'anchor' && p.thread === thread;
				});
				const prior = at >= 0 ? this.parse(unsaved[at]) : null;
				if (prior?.t === 'anchor') {
					e = { ...e, restore: e.restore ?? prior.restore, file: e.file ?? prior.file };
					const [old] = unsaved.splice(at, 1);
					const fresh = added.lastIndexOf(old);
					if (fresh >= 0) added.splice(fresh, 1);
					else gone.push(old);
				}
			}
			const line = JSON.stringify(e);
			this.parsed.set(line, e);
			unsaved.push(line);
			added.push(line);
		}
		this.share!.edit(
			gone.map((line) => [line, null]),
			added
		);
		this.unsaved = unsaved;
		this.follow();
	}

	// the unsaved lines collapsed where they stand, as a solo save collapses the staged ones, then `events`
	private save(events: CommentEvent[]): void {
		const kept = new Set(collapseStaged(this.pending()).map((e) => JSON.stringify(e)));
		const merged = new Map<string, string>();
		for (const line of kept) {
			const e = this.parse(line);
			if (e?.t === 'open') merged.set(e.id, line);
		}
		const changes: [string, string | null][] = [];
		for (const line of this.unsaved) {
			if (kept.has(line)) continue;
			const e = this.parse(line);
			changes.push([line, e?.t === 'open' ? (merged.get(e.id) ?? null) : null]);
		}
		this.unsaved = [];
		this.share!.edit(
			changes,
			events.map((e) => JSON.stringify(e))
		);
		this.follow();
	}

	/** false when this workspace has nowhere to keep a log - a guest session, or no folder open */
	get writable(): boolean {
		return this.root !== null && this.path(this.root) !== null;
	}

	/** threads on one file, workspace-relative path */
	forFile(file: string): CommentThread[] {
		return this.threads.filter((t) => t.file === file);
	}
}

/** `lines` less the last copy of each line in `drop`, once per copy */
function withoutLast(lines: string[], drop: string[]): string[] {
	const left = new Map<string, number>();
	for (const line of drop) left.set(line, (left.get(line) ?? 0) + 1);
	const out: string[] = [];
	for (let i = lines.length - 1; i >= 0; i--) {
		const n = left.get(lines[i]) ?? 0;
		if (n > 0) left.set(lines[i], n - 1);
		else out.push(lines[i]);
	}
	return out.reverse();
}

/** workspace-relative, posix separators: the log travels between machines and OSes */
export function relativeTo(root: string, path: string): string {
	const r = root.replace(/[\\/]+$/, '').replace(/\\/g, '/');
	const p = path.replace(/\\/g, '/');
	return p.startsWith(r + '/') ? p.slice(r.length + 1) : p;
}
