// The workspace's hands on the text buffers' writer, in absolute paths. Every edit is already in a
// file's text the moment it is made (session().edit); this is what flushes, saves, sets aside and
// takes in from disk around it. A guest has no disk, so all of it does nothing there.
import type { Eol } from './edits/lineEndings';
import type { TextBuffers } from '$lib/buffers/textBuffers';

export type FileWriterDeps = {
	getLoadedPath(): string | null;
	isGuest(): boolean;
	/** the open folder's buffers, null while none is open */
	files(): TextBuffers | null;
	/** the path's place in that folder, or null when it is outside it */
	relOf(path: string): string | null;
};

export class FileWriter {
	constructor(private deps: FileWriterDeps) {}

	private get files(): TextBuffers | null {
		return this.deps.isGuest() ? null : this.deps.files();
	}

	private target(path: string | null): { files: TextBuffers; rel: string } | null {
		const files = this.files;
		const rel = files && path ? this.deps.relOf(path) : null;
		return files && rel && files.has(rel) ? { files, rel } : null;
	}

	/** the open file's change not yet on disk */
	get pending(): { path: string; content: string } | null {
		const path = this.deps.getLoadedPath();
		const t = this.target(path);
		if (!t || !t.files.isDirty(t.rel)) return null;
		return { path: path!, content: t.files.text(t.rel)!.toString() };
	}

	isDirty(path: string): boolean {
		const t = this.target(path);
		return !!t && t.files.isDirty(t.rel);
	}

	/** what is on disk as far as the writer knows, LF; null for a file it does not hold */
	baselineOf(path: string): string | null {
		const t = this.target(path);
		return t ? t.files.baselineOf(t.rel) : null;
	}

	eolOf(path: string): Eol {
		const t = this.target(path);
		return t ? t.files.eolOf(t.rel) : '\n';
	}

	/** write every pending change now */
	flush(): void {
		void this.files?.flushAll();
	}

	/** and wait for the writes to land (compiles need the on-disk copy current for SyncTeX) */
	async flushAndWait(): Promise<void> {
		await this.files?.flushAll();
	}

	whenIdle(): Promise<void> {
		return this.files?.whenIdle() ?? Promise.resolve();
	}

	/** Ctrl+S: write now and say so; `force` writes over a change on disk the user has seen */
	save(path: string, force = false): Promise<boolean> {
		const t = this.target(path);
		return t ? t.files.save(t.rel, force) : Promise.resolve(false);
	}

	/** stop a file's pending write (the open one when no path); its text keeps the change */
	discard(path = this.deps.getLoadedPath()): void {
		const t = this.target(path);
		if (t) t.files.discard(t.rel);
	}

	/** the open file's unwritten change, taken out: its text goes back to what is on disk */
	detach(): { path: string; content: string } | null {
		const p = this.pending;
		if (p) this.revert(p.path);
		return p;
	}

	/** a change taken out by detach, put back */
	reattach(p: { path: string; content: string }): void {
		const t = this.target(p.path);
		if (t) t.files.fold(t.rel, p.content);
	}

	/** drop a file's unwritten change: its text goes back to the disk as last known */
	revert(path: string): void {
		const t = this.target(path);
		if (t) t.files.revert(t.rel);
	}

	/** the file changed on disk and the buffer takes it in, as one undoable edit */
	adoptDisk(path: string, text: string, eol?: Eol): void {
		const t = this.target(path);
		if (t) t.files.adoptDisk(t.rel, text, eol);
	}

	/** autosave resumes for a file it stood down for */
	resume(path: string): void {
		const t = this.target(path);
		if (t) t.files.resume(t.rel);
	}

	/** catch every other buffered file up with its disk */
	async syncFromDisk(): Promise<void> {
		const loaded = this.deps.getLoadedPath();
		await this.files?.syncFromDisk((loaded && this.deps.relOf(loaded)) || undefined);
	}

	/** a rename moved a file or folder: its text and unwritten edits go along */
	retarget(from: string, to: string): void {
		const files = this.files;
		const a = this.deps.relOf(from);
		const b = this.deps.relOf(to);
		if (files && a && b) files.move(a, b);
	}
}
