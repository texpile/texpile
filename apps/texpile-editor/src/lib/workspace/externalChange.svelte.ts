// Detecting that the open file changed on disk underneath us, and resolving the conflict.
//
// If our buffer is clean (or already matches disk) the new bytes are adopted silently. If the
// user has local edits that differ, we surface a modal and let them pick. Everything waits on the
// save pipeline going idle first, so we never read our own half-written file and mistake it for
// an external edit.
import { get } from 'svelte/store';
import { activeFilePath, isDirty } from '$lib/workspace/workspaceStore';
import { toLf, detectEol, type Eol } from '$lib/workspace/fileSystem';

export interface ExternalChangeDeps {
	getLoadedPath(): string | null;
	/** only text-ish kinds can meaningfully conflict */
	isTextual(): boolean;
	isTex(): boolean;
	/** resolves once every queued write has landed */
	whenIdle(): Promise<void>;
	readText(path: string): Promise<string>;
	getDiskBaseline(): string;
	setDiskBaseline(text: string): void;
	/** the live buffer for the current kind */
	getBuffer(): string;
	setTexSource(text: string): void;
	setRawContent(text: string): void;
	setEol(eol: Eol): void;
	/** re-derive docMeta + visualDoc and remount after adopting disk content */
	rebuildVisual(): void;
	/** drop any queued autosave of the edits we just replaced */
	discardQueuedSave(): void;
	/** fold adopted content into the shared doc so guests see it too */
	sessionEdit(path: string, content: string): void;
	/** "keep mine": overwrite disk now */
	saveNow(): void;
}

export class ExternalChangeWatcher {
	conflict = $state<{ path: string; disk: string; eol: Eol } | null>(null);

	constructor(private deps: ExternalChangeDeps) {}

	async check(): Promise<void> {
		const d = this.deps;
		const path = d.getLoadedPath();
		if (!path || !d.isTextual() || this.conflict) return;
		await d.whenIdle(); // so we don't read our own half-written file
		if (d.getLoadedPath() !== path) return; // the file switched while we waited
		let raw: string;
		try {
			raw = await d.readText(path);
		} catch {
			return;
		}
		const disk = toLf(raw); // compare in LF against our LF baseline/buffers
		if (get(activeFilePath) !== path || disk === d.getDiskBaseline()) return; // unchanged on disk
		const eol = detectEol(raw); // the external writer may have changed the ending
		if (!get(isDirty) || d.getBuffer() === disk) this.applyDiskReload(disk, eol);
		else this.conflict = { path, disk, eol };
	}

	/** adopt the on-disk version into the editor, discarding local edits; disk is LF-normalized */
	applyDiskReload(disk: string, eol: Eol): void {
		const d = this.deps;
		d.setEol(eol);
		d.setDiskBaseline(disk);
		if (d.isTex()) {
			d.setTexSource(disk);
			d.rebuildVisual();
		} else {
			d.setRawContent(disk);
		}
		isDirty.set(false);
		// the buffer now matches disk: drop any queued autosave of the edits we just replaced, or a
		// later flush would clobber the version the user chose to keep
		d.discardQueuedSave();
		// the host materializer's lastWritten update prevents an echo write back to disk
		const path = d.getLoadedPath();
		if (path) d.sessionEdit(path, disk);
	}

	resolve(choice: 'reload' | 'keep'): void {
		const c = this.conflict;
		this.conflict = null;
		if (!c) return;
		if (choice === 'reload') this.applyDiskReload(c.disk, c.eol);
		else if (this.deps.getLoadedPath() === c.path) this.deps.saveNow();
	}
}
