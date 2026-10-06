// Detecting that the open file changed on disk underneath us, and resolving the conflict.
//
// If our buffer is clean (or already matches disk) the new bytes are taken in silently, as one
// undoable edit of the file's text that every editor on it follows. If the user has local edits
// that differ, we surface a modal and let them pick. Everything waits on the writer going idle
// first, so we never read our own half-written file and mistake it for an external edit.
import { activeFilePath, isDirty } from '$lib/workspace/workspaceStore';
import { toLf, detectEol, type Eol } from '$lib/workspace/fileSystem';
import { recordDiskStamp } from '$lib/workspace/diskStamp';
import { addLocalHistory } from '$lib/workspace/localHistory/localHistory.svelte';

// long enough for a rewrite-in-place to finish, short enough that the banner still feels immediate
const RECHECK_MS = 100;

export type ExternalChangeDeps = {
	getLoadedPath(): string | null;
	/** only text-ish kinds can meaningfully conflict */
	isTextual(): boolean;
	/** resolves once every queued write has landed */
	whenIdle(): Promise<void>;
	readText(path: string): Promise<string>;
	getDiskBaseline(): string;
	setDiskBaseline(text: string): void;
	/** the live buffer for the current kind */
	getBuffer(): string;
	/** the file's text holds edits the disk does not have */
	hasUnwritten(path: string): boolean;
	/** the file's text takes the disk's content; its editors follow it there */
	adopt(path: string, text: string, eol: Eol): void;
	/** is the path still on disk? a failed read alone does not settle it */
	exists(path: string): Promise<boolean>;
	/** the open file went missing on disk, or came back */
	setDeleted(deleted: boolean): void;
	/** "keep mine": overwrite disk now. Must FORCE past the save pipeline's external-write guard -
	 * the guard is what raised this conflict, and by choosing "keep" the user has seen that disk
	 * differs and decided to overwrite it. An unforced save would just re-trip the guard forever. */
	saveNow(): void;
};

export class ExternalChangeWatcher {
	conflict = $state<{ path: string; disk: string; eol: Eol } | null>(null);
	/**
	 * The conflict the user postponed, and the disk content they postponed it against. Held so
	 * that "decide later" actually means later: without it the next autosave re-trips the save
	 * guard and the same question comes back 1.5 seconds after the next keystroke. A fresh
	 * external write is a different question and does get asked.
	 */
	deferred = $state<{ path: string; disk: string } | null>(null);
	/** told after disk content replaced the buffer, for state resolved against the old text */
	onAdopted: (() => void) | null = null;

	constructor(private deps: ExternalChangeDeps) {}

	/** `deliberate` = raised by a manual Save, which reopens a question the user postponed */
	async check(deliberate = false): Promise<void> {
		const d = this.deps;
		const path = d.getLoadedPath();
		if (!path || !d.isTextual() || this.conflict) return;
		await d.whenIdle(); // so we don't read our own half-written file
		if (d.getLoadedPath() !== path) return; // the file switched while we waited
		let raw: string;
		try {
			raw = await d.readText(path);
		} catch {
			await this.checkOrphaned(path);
			return;
		}
		d.setDeleted(false); // it reads, so it is there: an earlier deletion has been undone
		const disk = toLf(raw); // compare in LF against our LF baseline/buffers
		if (activeFilePath.current !== path) return;
		if (disk === d.getDiskBaseline()) {
			// same bytes, new mtime (touch, a formatter, a checkout and back): nothing to adopt, but
			// the save guard compares stamps, and without a fresh one every later autosave re-trips it
			void recordDiskStamp(path);
			return;
		}
		const eol = detectEol(raw); // the external writer may have changed the ending
		if (!d.hasUnwritten(path) || d.getBuffer() === disk) return this.applyDiskReload(disk, eol);
		// already asked about exactly this, and told to wait. Pressing Save is the user revisiting it,
		// so it asks again rather than leaving the keystroke to do nothing at all
		if (!deliberate && this.deferred?.path === path && this.deferred.disk === disk) return;
		this.deferred = null;
		this.conflict = { path, disk, eol };
	}

	/**
	 * The read failed. Usually that means the file was renamed or deleted from outside, and the
	 * buffer is now the only copy: it stays on screen, edits and all, and the editor says so
	 * rather than letting the next save quietly write the old name back.
	 *
	 * A failed read is not proof on its own, so existence is re-checked after a moment. VS Code
	 * does the same, for the same reason: network shares report deletes for files that are still
	 * there, and a file being rewritten is briefly unreadable.
	 */
	private async checkOrphaned(path: string): Promise<void> {
		await new Promise((r) => setTimeout(r, RECHECK_MS));
		if (this.deps.getLoadedPath() !== path) return;
		if (!(await this.deps.exists(path))) this.deps.setDeleted(true);
	}

	/** adopt the on-disk version into the editor, discarding local edits; disk is LF-normalized */
	applyDiskReload(disk: string, eol: Eol): void {
		const d = this.deps;
		const path = d.getLoadedPath();
		if (!path) return;
		d.setDiskBaseline(disk);
		// the buffer now matches disk: nothing left to postpone
		this.deferred = null;
		d.adopt(path, disk, eol);
		isDirty.current = false;
		this.onAdopted?.();
	}

	/** 'defer' answers neither: disk keeps its bytes, the buffer keeps its edits and stays dirty.
	 * The only answer that destroys nothing, and it holds until disk changes again or the file is
	 * saved deliberately. */
	resolve(choice: 'reload' | 'keep' | 'defer'): void {
		const c = this.conflict;
		this.conflict = null;
		if (!c) return;
		if (choice === 'defer') {
			this.deferred = { path: c.path, disk: c.disk };
			return;
		}
		this.deferred = null;
		if (choice === 'reload') {
			// the edits being replaced were never saved: kept first, so Reload is not the end of them
			if (this.deps.getLoadedPath() === c.path) void addLocalHistory(c.path, this.deps.getBuffer(), 'before-reload');
			this.applyDiskReload(c.disk, c.eol);
		} else if (this.deps.getLoadedPath() === c.path) this.deps.saveNow();
	}
}
