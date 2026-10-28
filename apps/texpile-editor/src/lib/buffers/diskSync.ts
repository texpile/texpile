import { decodeEditableText } from '$lib/files/service/textLimit';
import { takeDiskChange } from '$lib/files/sync/diskMerge';
import { detectEol, toLf, type Eol } from '$lib/workspace/edits/lineEndings';
import { m } from '$lib/paraglide/messages';
import type { TextBuffers } from './textBuffers';

/** a loaded file catching up with its disk, as IntelliJ's FileDocumentManager does in its merge mode */
export class DiskSync {
	/** the disk and the editor changed the same words: rel -> the disk's text, until someone chooses */
	private readonly conflicted = new Map<string, string>();

	constructor(private readonly buffers: TextBuffers) {}

	get conflictedFiles(): string[] {
		return [...this.conflicted.keys()];
	}

	inConflict(rel: string): boolean {
		return this.conflicted.has(rel);
	}

	forget(rel: string): void {
		if (this.conflicted.delete(rel)) this.buffers.hooks.resolved?.(this.buffers.abs(rel));
	}

	/** before a write, as IntelliJ saves: a disk that moved is read and taken in first; false holds the write */
	async catchUp(rel: string, abs: string): Promise<boolean> {
		const disk = await this.buffers.hooks.diskChanged?.(abs);
		if (!disk) return true;
		if (disk === 'gone') {
			this.buffers.hold(rel);
			this.buffers.hooks.deleted?.(abs);
			return false;
		}
		return this.take(rel, abs);
	}

	async syncAll(rels: string[], changed?: (absPath: string) => boolean): Promise<void> {
		for (const rel of rels) if (!changed || changed(this.buffers.abs(rel))) await this.syncOne(rel);
	}

	async syncOne(rel: string): Promise<void> {
		const b = this.buffers;
		const abs = b.abs(rel);
		const disk = await b.hooks.diskChanged?.(abs);
		if (!disk) return;
		if (disk === 'gone') return b.hooks.deleted?.(abs);
		// a file held for a moment (a sync client, a virus scanner) is read again at the next change or write
		const taken = await this.take(rel, abs).catch(() => false);
		if (taken && b.hasPending(rel)) void b.flush(rel);
	}

	/** the disk's text in LF, null when it is gone, or 'unreadable' when it is not editable text */
	private async read(abs: string): Promise<{ text: string; eol: Eol } | null | 'unreadable'> {
		let bytes: Uint8Array;
		try {
			bytes = await this.buffers.fs.readBytes(abs);
		} catch (e) {
			if (/ENOENT|no such file|not found/i.test(e instanceof Error ? e.message : String(e))) return null;
			throw e;
		}
		const raw = decodeEditableText(bytes);
		return raw === null ? 'unreadable' : { text: toLf(raw), eol: detectEol(raw) };
	}

	/** the disk's text goes in whole, or merged with unsaved edits; false when the same words changed on both sides */
	private async take(rel: string, abs: string): Promise<boolean> {
		const b = this.buffers;
		const read = await this.read(abs);
		const t = b.text(rel);
		if (!t) return false;
		if (read === null) {
			b.hold(rel);
			b.hooks.deleted?.(abs);
			return false;
		}
		if (read === 'unreadable') {
			b.hold(rel);
			b.hooks.failed?.(abs, new Error(m.filesync_disk_not_text()));
			return false;
		}
		const { text: disk, eol } = read;
		const memory = t.toString();
		const take = takeDiskChange(disk, b.baselineOf(rel), memory, b.hasPending(rel) || b.isDirty(rel));
		if (take.kind === 'same') await b.hooks.recordStamp?.(abs);
		else if (take.kind === 'adopt') {
			b.adoptDisk(rel, disk, eol);
			b.hooks.diskTaken?.(abs, disk);
		} else if (take.kind === 'merge') b.applyMerge(rel, disk, take.edits);
		else {
			b.hold(rel);
			this.conflicted.set(rel, disk);
			b.hooks.conflict?.(abs, disk, memory);
			return false;
		}
		return true;
	}

	async resolve(rel: string, choice: 'disk' | 'memory'): Promise<boolean> {
		const b = this.buffers;
		const held = this.conflicted.get(rel);
		if (held === undefined) return false;
		this.conflicted.delete(rel);
		if (choice === 'memory') {
			b.takeCommonText(rel, held);
			return b.save(rel, true);
		}
		// the disk as it is now, which can have moved again while the dialog was up
		const read = await this.read(b.abs(rel)).catch(() => null);
		const disk = read && read !== 'unreadable' ? read : { text: held, eol: undefined };
		b.adoptDisk(rel, disk.text, disk.eol);
		b.hooks.diskTaken?.(b.abs(rel), disk.text);
		return true;
	}
}
