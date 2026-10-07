// the buffers' writer by absolute path, for the workspace; a guest has no disk, so it does nothing there
import type { Eol } from '$lib/workspace/edits/lineEndings';
import type { TextBuffers } from './textBuffers';

export type FileWriterDeps = {
	getLoadedPath(): string | null;
	isGuest(): boolean;
	/** the open folder's buffers, null while none is open */
	files(): TextBuffers | null;
	/** the path's place in that folder, or null when it is outside it */
	keyOf(path: string): string | null;
};

export class FileWriter {
	constructor(private deps: FileWriterDeps) {}

	private get files(): TextBuffers | null {
		return this.deps.isGuest() ? null : this.deps.files();
	}

	private target(path: string | null): { files: TextBuffers; rel: string } | null {
		const files = this.files;
		const rel = files && path ? this.deps.keyOf(path) : null;
		return files && rel && files.has(rel) ? { files, rel } : null;
	}

	/** the open file's change not yet on disk */
	get pending(): { path: string; content: string } | null {
		const path = this.deps.getLoadedPath();
		const t = this.target(path);
		if (!t || !t.files.isDirty(t.rel)) return null;
		return { path: path!, content: t.files.text(t.rel)!.toString() };
	}

	/** files whose edits wait on a change on disk, the open one too: leaving the folder asks about them */
	stranded(): string[] {
		const files = this.files;
		return files ? files.refusedFiles.map((rel) => files.abs(rel)) : [];
	}

	/** something at `path`, or under it, holds edits that are not on disk */
	unwrittenUnder(path: string): boolean {
		const files = this.files;
		const key = files ? this.deps.keyOf(path) : null;
		return !!key && files!.under(key).some((k) => files!.hasPending(k) || files!.isDirty(k));
	}

	/** `path` is deleted: what was held of it, and of everything under it, goes */
	dropUnder(path: string): void {
		const files = this.files;
		const key = files ? this.deps.keyOf(path) : null;
		if (key) for (const k of files!.under(key)) files!.drop(k);
	}

	/** a write of this file found it changed on disk */
	isRefused(path: string): boolean {
		const t = this.target(path);
		return !!t && t.files.refusedFiles.includes(t.rel);
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

	/** the open file's unwritten change, taken out: its text goes back to what is on disk */
	detach(): { path: string; content: string } | null {
		const p = this.pending;
		if (p) this.revert(p.path);
		return p;
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
		await this.files?.syncFromDisk((loaded && this.deps.keyOf(loaded)) || undefined);
	}

	/** a rename moved a file or folder: its text and unwritten edits go along */
	retarget(from: string, to: string): void {
		const files = this.files;
		const a = this.deps.keyOf(from);
		const b = this.deps.keyOf(to);
		if (files && a && b) files.move(a, b);
	}
}
