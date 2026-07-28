// debounced autosave + the serial write chain. one queued debounced write (`pending`), tracked
// so a file switch can flush it instead of dropping it; all writes run through `chain` so they
// never overlap and apply in order (loadFile awaits whenIdle() before re-reading, so a re-opened
// file never reads stale pre-flush bytes).
import { fromLf, basename, samePath, type Eol } from './fileSystem';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

const AUTOSAVE_MS = 1500;

export interface SaveDeps {
	/** shared session: every edit streams into the shared doc per keystroke. */
	sessionEdit(path: string, content: string): void;
	/** a guest has no disk: edits live in the CRDT only, pending/writes never engage. */
	isGuest(): boolean;
	autosaveActive(): boolean;
	writeText(path: string, content: string): Promise<unknown>;
	getEol(): Eol;
	getLoadedPath(): string | null;
	/** live buffer of the loaded file, to decide whether a finished write cleared dirtiness. */
	getLiveContent(): string;
	setDiskBaseline(content: string): void;
	setDirty(dirty: boolean): void;
}

export class SavePipeline {
	saving = $state(false);
	private timer: ReturnType<typeof setTimeout> | null = null;
	private _pending: { path: string; content: string } | null = null;
	private chain: Promise<void> = Promise.resolve();

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
		if (!this._pending) return;
		const { path, content } = this._pending;
		this._pending = null;
		void this.enqueue(path, content, false);
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
	}

	/** detach and return the pending edit without writing (the save-before-switch prompt owns it). */
	detach(): { path: string; content: string } | null {
		const p = this._pending;
		this._pending = null;
		return p;
	}

	/** reattach a detached edit so it is tracked and re-guarded again (prompt cancelled). */
	reattach(p: { path: string; content: string }) {
		this._pending = p;
	}

	/** repoint a queued autosave when its file (or a parent folder) is renamed/moved, so the edit
	 * lands in the new path instead of re-creating the old one. */
	retarget(from: string, to: string) {
		if (!this._pending) return;
		const sep = from.includes('\\') ? '\\' : '/';
		if (samePath(this._pending.path, from)) this._pending = { ...this._pending, path: to };
		else if (this._pending.path.startsWith(from + sep))
			this._pending = { ...this._pending, path: to + this._pending.path.slice(from.length) };
	}

	/** append a write to the serial chain. snapshots the line ending now so a queued write still
	 * applies the right one if the user switches files first. */
	enqueue(path: string, content: string, notify: boolean): Promise<void> {
		return this.enqueueWithEol(path, content, notify, this.deps.getEol());
	}

	enqueueWithEol(path: string, content: string, notify: boolean, eol: Eol): Promise<void> {
		this.chain = this.chain.then(() => this.write(path, content, notify, eol));
		return this.chain;
	}

	private async write(path: string, content: string, notify: boolean, eol: Eol) {
		this.saving = true;
		try {
			await this.deps.writeText(path, fromLf(content, eol)); // re-apply the file's CRLF/LF on disk
			if (this.deps.getLoadedPath() === path) {
				// what we just wrote is now the on-disk baseline, so our own save isn't seen as a conflict
				this.deps.setDiskBaseline(content);
				// clear "unsaved" only if what we wrote is still the live buffer;
				// otherwise a newer edit arrived mid-write and is still pending
				if (content === this.deps.getLiveContent()) this.deps.setDirty(false);
			}
			if (notify) toaster.success({ title: m.wsview_toast_saved_title(), description: basename(path), duration: 1200 });
		} catch (e) {
			toaster.error({ title: m.wsview_toast_save_failed_title(), description: e instanceof Error ? e.message : m.wsview_error_unknown() });
		} finally {
			this.saving = false;
		}
	}
}
