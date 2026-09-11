// debounced autosave + the serial write chain. one queued debounced write (`pending`), tracked
// so a file switch can flush it instead of dropping it; all writes run through `chain` so they
// never overlap and apply in order (loadFile awaits whenIdle() before re-reading, so a re-opened
// file never reads stale pre-flush bytes).
import { fromLf, basename, samePath, type Eol } from './fileSystem';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

const AUTOSAVE_MS = 1500;

export type SaveDeps = {
	/** shared session: every edit streams into the shared doc per keystroke. */
	sessionEdit(path: string, content: string): void;
	/** a guest has no disk: edits live in the CRDT only, pending/writes never engage. */
	isGuest(): boolean;
	autosaveActive(): boolean;
	/** a write landed, so the path exists again */
	clearDeleted(): void;
	writeText(path: string, content: string): Promise<unknown>;
	getEol(): Eol;
	getLoadedPath(): string | null;
	/** live buffer of the loaded file, to decide whether a finished write cleared dirtiness. */
	getLiveContent(): string;
	setDiskBaseline(content: string): void;
	setDirty(dirty: boolean): void;
	/** did someone else write this file since we last read/wrote it? (mtime+size stamp) */
	diskChanged(path: string): Promise<boolean>;
	/** stamp the path as freshly synchronized after our own successful write */
	recordDiskStamp(path: string): Promise<void>;
	/** an external write was detected where we were about to save: hand off to the conflict flow.
	 * `deliberate` = the user pressed Save, so a conflict they postponed has to be asked again */
	raiseConflict(path: string, deliberate: boolean): void;
};

export class SavePipeline {
	saving = $state(false);
	private timer: ReturnType<typeof setTimeout> | null = null;
	private _pending: { path: string; content: string } | null = null;
	private chain: Promise<void> = Promise.resolve();
	// bumped whenever a queued edit is deliberately abandoned, so a write already in flight cannot
	// re-queue itself afterwards
	private era = 0;
	/** paths of writes that have been handed to the chain but have not settled yet */
	private inFlight = new Set<string>();

	beforeWrite: ((path: string, content: string) => Promise<void>) | null = null;

	constructor(private deps: SaveDeps) {}

	/** the queued debounced write, if any (read-only; use reattach/detach/discard to mutate). */
	get pending(): { path: string; content: string } | null {
		return this._pending;
	}

	/** resolves once every queued write has landed. */
	whenIdle(): Promise<void> {
		return this.chain;
	}

	cancelTimer() {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}

	/** queue a debounced write; a save already queued for a DIFFERENT file flushes first so
	 * switching files can never drop the previous file's edit. */
	schedule(path: string | null, content: string) {
		if (!path) return;
		this.deps.sessionEdit(path, content);
		if (this.deps.isGuest()) return;
		if (this._pending && this._pending.path !== path) this.flush();
		this._pending = { path, content };
		// autosave off: track the edit (so Save / the switch-guard have it) but don't auto-write
		if (!this.deps.autosaveActive()) return;
		this.cancelTimer();
		this.timer = setTimeout(() => this.flush(), AUTOSAVE_MS);
	}

	flush() {
		this.cancelTimer();
		const p = this._pending;
		if (!p) return;
		this._pending = null;
		const era = this.era;
		this.inFlight.add(p.path);
		void this.enqueue(p.path, p.content, false).then((landed) => {
			this.inFlight.delete(p.path);
			// a write that did not land (the external-write guard, a locked file) keeps the edit
			// queued, so the next flush retries it instead of dropping it. Not across a discard
			// though: the file was deleted, or the user took the disk version, and re-queueing
			// would write it back out from under them
			if (!landed && !this._pending && this.era === era) this._pending = p;
		});
	}

	/** flush and wait for the write to land (compiles need the on-disk copy current for SyncTeX). */
	async flushAndWait() {
		this.flush();
		await this.chain;
	}

	/** drops any queued autosave without writing it (e.g. the open file is being deleted). */
	discard() {
		this.cancelTimer();
		this._pending = null;
		this.era++;
	}

	/** detach and return the pending edit without writing (the save-before-switch prompt owns it). */
	detach(): { path: string; content: string } | null {
		const p = this._pending;
		this._pending = null;
		this.era++;
		return p;
	}

	/** reattach a detached edit so it is tracked and re-guarded again (prompt cancelled). */
	reattach(p: { path: string; content: string }) {
		this._pending = p;
	}

	/** repoint a queued autosave when its file (or a parent folder) is renamed/moved, so the edit
	 * lands in the new path instead of re-creating the old one. */
	retarget(from: string, to: string) {
		const sep = from.includes('\\') ? '\\' : '/';
		const covers = (p: string) => samePath(p, from) || p.startsWith(from + sep);
		// nothing queued means the edit is in flight instead; if that write fails it must not come
		// back pointed at a path this rename just emptied. Only when the rename is actually the one
		// that moved it: an unrelated rename would otherwise cost a legitimate retry
		if (!this._pending) {
			if ([...this.inFlight].some(covers)) this.era++;
			return;
		}
		if (samePath(this._pending.path, from)) this._pending = { ...this._pending, path: to };
		else if (this._pending.path.startsWith(from + sep))
			this._pending = { ...this._pending, path: to + this._pending.path.slice(from.length) };
	}

	/** append a write to the serial chain. snapshots the line ending now so a queued write still
	 * applies the right one if the user switches files first. `force` skips the external-write
	 * guard: only the conflict modal's "keep mine" may use it, because by then the user has SEEN
	 * that disk differs and chosen to overwrite. */
	/** resolves true once the bytes are on disk, false when the write was aborted or failed */
	enqueue(path: string, content: string, notify: boolean, force = false): Promise<boolean> {
		return this.enqueueWithEol(path, content, notify, this.deps.getEol(), force);
	}

	enqueueWithEol(path: string, content: string, notify: boolean, eol: Eol, force = false): Promise<boolean> {
		const result = this.chain.then(() => this.write(path, content, notify, eol, force));
		// the chain must stay resolvable: a rejection parked on it would make whenIdle() throw and
		// every later save skip. write() catches its own errors, so this is insurance
		this.chain = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}

	private async write(path: string, content: string, notify: boolean, eol: Eol, force: boolean): Promise<boolean> {
		this.saving = true;
		try {
			// The point of no return for someone else's edit: writeText below replaces the whole file,
			// so if disk moved since we last read or wrote it (VS Code, a git checkout, an AI agent),
			// overwriting now would silently destroy that change. Abort and surface the existing
			// conflict modal instead; the user's edit is still in the buffer and still dirty, so
			// nothing of THEIRS is lost either.
			if (!force && (await this.deps.diskChanged(path))) {
				// `notify` is only ever set by a manual Ctrl+S / Save, which is exactly the difference
				// between "autosave tripped over this again" and "the user is asking to write it now"
				this.deps.raiseConflict(path, notify);
				return false;
			}
			await this.beforeWrite?.(path, content).catch(() => undefined);
			await this.deps.writeText(path, fromLf(content, eol)); // re-apply the file's CRLF/LF on disk
			await this.deps.recordDiskStamp(path); // our own write must not read as an external one
			if (this.deps.getLoadedPath() === path) {
				// what we just wrote is now the on-disk baseline, so our own save isn't seen as a conflict
				this.deps.setDiskBaseline(content);
				// clear "unsaved" only if what we wrote is still the live buffer;
				// otherwise a newer edit arrived mid-write and is still pending
				if (content === this.deps.getLiveContent()) this.deps.setDirty(false);
			}
			if (notify) toaster.success({ title: m.wsview_toast_saved_title(), description: basename(path), duration: 1200 });
			this.deps.clearDeleted(); // the bytes are on disk again, whatever happened to the old name
			return true;
		} catch (e) {
			toaster.error({ title: m.wsview_toast_save_failed_title(), description: e instanceof Error ? e.message : m.wsview_error_unknown() });
			return false;
		} finally {
			this.saving = false;
		}
	}
}
