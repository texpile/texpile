// every text file the folder has open, as CRDT text, and the one writer that puts it on disk
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { LocalFork, splice } from '$lib/collab/localFork';
import { spliceDiff } from '$lib/collab/spliceDiff';
import { freeTextName, manifestOf, textEntry } from '$lib/collab/session';
import {
	DISK_ORIGIN,
	EDIT_ORIGIN,
	MAX_SHARED_TEXT_BYTES,
	SEED_ORIGIN,
	changedSpans,
	isGeneratedArtifact,
	isShared
} from '$lib/collab/sharedFiles';
import { detectEol, fromLf, toLf, type Eol } from '$lib/workspace/edits/lineEndings';
import type { TextSpan } from '$lib/comments/editGestures';
import { createFileUndo, forgetDeleted, joinLastStep } from './fileUndo';
import { BufferSharing } from './bufferSharing';
import { BufferKeys } from './bufferKeys';
import { decodeEditableText } from '$lib/files/service/textLimit';
import { diskEdits, takeDiskEdits, type MergeEdit } from '$lib/files/sync/diskMerge';
import { DiskSync } from './diskSync';
import { WriteSchedule } from './writeSchedule';
import type { TextBuffersFs, WriteHooks } from './writeHooks';

export type { TextBuffersFs, WriteHooks } from './writeHooks';

/** `name`: the text's name in its doc, which a move keeps */
type Seeded = { doc: Y.Doc; eol: Eol; name: string };

function outside(key: string): boolean {
	return /^([\\/]|[A-Za-z]:)/.test(key);
}

export class TextBuffers {
	/** what a session syncs: the manifest, the shareable files' text, the comment log */
	readonly shared = new Y.Doc();
	readonly sharing: BufferSharing;
	/** files no session may see */
	readonly local = new Y.Doc();
	readonly awareness = new Awareness(this.shared);
	private readonly localAwareness = new Awareness(this.local);
	private readonly fork = new LocalFork(this.shared);
	hooks: WriteHooks = {};
	/** a change to a file's text from anywhere but its own seeding */
	onChange: ((rel: string, origin: unknown) => void) | null = null;
	/** the peer a transaction origin came from, or null when it is this side's own */
	senderOf: ((origin: unknown) => number | null) | null = null;
	/** a peer's change to a shared file, as it applies: the file just before and just after it */
	onRemoteChange: ((rel: string, before: string, after: string, from: number, spans: TextSpan[]) => void) | null = null;

	private readonly seeded = new Map<string, Seeded>();
	readonly keys = new BufferKeys();
	private readonly disk = new DiskSync(this);
	private readonly loading = new Map<string, Promise<Y.Text | null>>();
	/** rel -> LF content last synced with disk */
	private readonly baseline = new Map<string, string>();
	private readonly writes = new WriteSchedule(
		(rel) => void this.flush(rel),
		(rel) => this.destroyed || this.disk.inConflict(rel)
	);
	private readonly observers = new Map<string, () => void>();
	private readonly undo = new Map<string, Y.UndoManager>();
	/** rel -> LF content as of the last transaction, kept only while a session runs */
	private readonly running = new Map<string, string>();
	private tracking = false;
	private chain: Promise<unknown> = Promise.resolve();
	private destroyed = false;

	constructor(
		private readonly root: string,
		readonly fs: TextBuffersFs,
		private readonly joinPath: (root: string, rel: string) => string
	) {
		this.sharing = new BufferSharing(this, root, fs);
	}

	/** a key is the file's place in the folder, or its own path for a file outside it */
	abs(rel: string): string {
		return outside(rel) ? rel : this.joinPath(this.root, rel);
	}

	has(rel: string): boolean {
		return this.seeded.has(rel);
	}

	text(rel: string): Y.Text | null {
		const s = this.seeded.get(rel);
		return s ? s.doc.getText(s.name) : null;
	}

	awarenessOf(rel: string): Awareness | null {
		const s = this.seeded.get(rel);
		if (!s) return null;
		return s.doc === this.shared ? this.awareness : this.localAwareness;
	}

	eolOf(rel: string): Eol {
		return this.seeded.get(rel)?.eol ?? '\n';
	}

	/** what is on disk as far as this side knows, LF */
	baselineOf(rel: string): string | null {
		return this.baseline.get(rel) ?? null;
	}

	/** the text differs from what is on disk */
	isDirty(rel: string): boolean {
		const t = this.text(rel);
		return !!t && t.toString() !== this.baseline.get(rel);
	}

	/** the files held at `key` or under it, when it is a folder */
	under(key: string): string[] {
		return [...this.seeded.keys()].filter((k) => k === key || k.startsWith(key + '/'));
	}

	hasPending(rel: string): boolean {
		return this.writes.pending.has(rel);
	}

	/** files whose edits are not on disk: still waiting to be written, held back, or a write failed */
	get unwrittenFiles(): string[] {
		return [...this.seeded.keys()].filter((rel) => this.writes.pending.has(rel) || this.isDirty(rel));
	}

	/** files waiting on the File Cache Conflict choice */
	get conflictedFiles(): string[] {
		return this.disk.conflictedFiles;
	}

	/** the file's text, read from disk the first time; null when it is not lossless UTF-8 text */
	async ensure(rel: string): Promise<Y.Text | null> {
		if (this.seeded.has(rel)) {
			await this.disk.syncOne(rel);
			return this.text(rel);
		}
		const loading = this.loading.get(rel);
		if (loading) return loading;
		const load = this.load(rel);
		this.loading.set(rel, load);
		try {
			return await load;
		} finally {
			this.loading.delete(rel);
		}
	}

	private async load(rel: string): Promise<Y.Text | null> {
		let bytes: Uint8Array;
		try {
			bytes = await this.fs.readBytes(this.abs(rel));
		} catch {
			return null;
		}
		if (this.destroyed) return null;
		if (this.seeded.has(rel)) return this.text(rel);
		const raw = decodeEditableText(bytes);
		if (raw === null) return null;
		const doc = this.shareable(rel, bytes.byteLength) ? this.shared : this.local;
		this.seed(rel, toLf(raw), detectEol(raw), doc, bytes.byteLength);
		void this.hooks.recordStamp?.(this.abs(rel));
		return this.text(rel);
	}

	private shareable(rel: string, size: number): boolean {
		return !outside(rel) && isShared(rel) && !isGeneratedArtifact(rel) && size <= MAX_SHARED_TEXT_BYTES;
	}

	private seed(rel: string, text: string, eol: Eol, doc: Y.Doc, size: number): void {
		const name = freeTextName(rel, new Set([...this.seeded.values()].filter((s) => s.doc === doc).map((s) => s.name)));
		doc.transact(() => {
			if (doc === this.shared) manifestOf(doc).set(rel, textEntry(rel, name, size));
			const t = doc.getText(name);
			if (t.length > 0) t.delete(0, t.length);
			t.insert(0, text);
		}, SEED_ORIGIN);
		this.seeded.set(rel, { doc, eol, name });
		this.keys.remember(rel);
		this.baseline.set(rel, text);
		if (this.tracking && doc === this.shared) this.running.set(rel, text);
		this.observe(rel);
		this.undoOf(rel); // from the first edit on, the disk's included
	}

	/** watch one file's text; a change from anywhere but seeding or the disk is written back */
	private observe(rel: string): void {
		if (this.observers.has(rel)) return;
		const t = this.text(rel)!;
		const handler = (ev: Y.YTextEvent) => {
			const origin = ev.transaction.origin;
			if (this.tracking && this.running.has(rel)) {
				const before = this.running.get(rel) ?? '';
				const after = t.toString();
				this.running.set(rel, after);
				const from = this.senderOf?.(origin) ?? null;
				if (origin !== SEED_ORIGIN && from !== null && before !== after)
					this.onRemoteChange?.(rel, before, after, from, changedSpans(ev.delta, before, after));
			}
			if (origin === SEED_ORIGIN) return;
			this.onChange?.(rel, origin);
			if (origin === DISK_ORIGIN) return;
			this.writes.pending.add(rel);
			this.writes.schedule(rel);
		};
		t.observe(handler);
		this.observers.set(rel, () => t.unobserve(handler));
	}

	/** the write waits: a conflict or a deleted file */
	hold(rel: string): void {
		this.writes.cancel(rel);
		this.writes.pending.add(rel);
	}

	/** Keep Memory Changes: the disk's text becomes what the editor's is written over */
	takeCommonText(rel: string, disk: string): void {
		this.baseline.set(rel, disk);
	}

	/** write a file's pending change now; resolves true once it is on disk (or nothing was pending) */
	flush(rel: string): Promise<boolean> {
		this.writes.cancel(rel);
		if (!this.writes.pending.has(rel)) return this.chain.then(() => true);
		this.writes.pending.delete(rel);
		return this.enqueue(rel, false, false);
	}

	/** write every pending change and wait for the writes to land */
	async flushAll(): Promise<void> {
		for (const rel of [...this.writes.pending]) void this.flush(rel);
		await this.chain;
	}

	/** Ctrl+S: write now; `force` writes over the disk, for Keep Memory Changes */
	save(rel: string, force = false): Promise<boolean> {
		this.writes.cancel(rel);
		this.writes.pending.delete(rel);
		return this.enqueue(rel, true, force);
	}

	/** resolves once every queued write has landed */
	whenIdle(): Promise<void> {
		return this.chain.then(() => undefined);
	}

	/** stop the pending write of a file; its text keeps the change */
	discard(rel: string): void {
		this.writes.cancel(rel);
		this.writes.pending.delete(rel);
	}

	private enqueue(rel: string, notify: boolean, force: boolean): Promise<boolean> {
		const result = this.chain.then(() => this.write(rel, notify, force));
		// the chain must stay resolvable: a rejection parked on it would make whenIdle() throw
		this.chain = result.catch(() => undefined);
		return result;
	}

	private async write(rel: string, notify: boolean, force: boolean): Promise<boolean> {
		const t = this.text(rel);
		if (!t || this.destroyed) return false;
		const abs = this.abs(rel);
		// a rename or a drop while a hook ran: this name no longer holds this text
		const stillHere = () => !this.destroyed && this.text(rel) === t;
		let content = t.toString();
		try {
			if (!notify && content === this.baseline.get(rel)) {
				// even when the changes cancel out: what they moved is still recorded
				await this.beforeWrite(abs, content);
				return true;
			}
			if (!force && !(await this.disk.catchUp(rel, abs))) return false;
			content = t.toString();
			const verified = await this.hooks.verify?.(abs, content).catch(() => null);
			if (!stillHere()) return false;
			if (verified != null && verified !== content && t.toString() === content) {
				const was = content;
				// the check's rewrite is how the edit it saves is written, so it undoes with that edit
				joinLastStep(this.undoOf(rel)!, () => this.fold(rel, verified, was));
				content = verified;
			}
			await this.beforeWrite(abs, content);
			// again right before the bytes go: the save check takes a while on a long paper
			if (!stillHere() || (!force && !(await this.disk.catchUp(rel, abs)))) return false;
			content = t.toString();
			await this.fs.writeText(abs, fromLf(content, this.eolOf(rel)));
			await this.hooks.recordStamp?.(abs);
			this.baseline.set(rel, content);
			if (t.toString() === content) this.writes.pending.delete(rel);
			this.disk.forget(rel);
			this.writes.landed(rel);
			this.hooks.afterWrite?.(abs, content);
			return true;
		} catch (e) {
			if (stillHere()) this.writes.failed(rel);
			this.hooks.failed?.(abs, e);
			return false;
		}
	}

	/** hunk by hunk in one undoable step, so carets, collaborators and the edits between hunks stay put */
	applyMerge(rel: string, disk: string, edits: MergeEdit[]): void {
		const s = this.seeded.get(rel)!;
		const t = s.doc.getText(s.name);
		this.baseline.set(rel, disk);
		this.undo.get(rel)?.stopCapturing();
		takeDiskEdits(t, edits);
		this.writes.pending.add(rel);
		void this.hooks.recordStamp?.(this.abs(rel));
		this.hooks.diskTaken?.(this.abs(rel), disk);
	}

	/** a comment log that cannot be written must not keep the text from being saved */
	private async beforeWrite(abs: string, content: string): Promise<void> {
		await this.hooks.beforeWrite?.(abs, content).catch(() => undefined);
	}

	/** carry an editor's change from `before` to `content` into the file's text; with no `before` it goes in whole */
	fold(rel: string, content: string, before?: string, origin: unknown = EDIT_ORIGIN): void {
		const s = this.seeded.get(rel);
		if (!s) return;
		const t = s.doc.getText(s.name);
		if (s.doc === this.shared) return this.fork.fold(t, content, before, origin);
		// nothing merges into the local doc: the editor's text goes in as it differs from the file's
		const change = spliceDiff(t.toString(), content);
		if (change) this.local.transact(() => splice(t, change), origin);
	}

	/** the file changed on disk: its text takes the new content as one undoable edit, never written back */
	adoptDisk(rel: string, text: string, eol?: Eol): void {
		const s = this.seeded.get(rel);
		if (!s) return;
		this.discard(rel);
		this.disk.forget(rel);
		if (eol) s.eol = eol;
		this.baseline.set(rel, text);
		this.undo.get(rel)?.stopCapturing();
		const t = s.doc.getText(s.name);
		const edits = diskEdits(t.toString(), text);
		// the same text: fold still lets a shared session's held updates in
		if (edits.length) takeDiskEdits(t, edits);
		else this.fold(rel, text, undefined, DISK_ORIGIN);
		void this.hooks.recordStamp?.(this.abs(rel));
	}

	/** drop a file's unwritten edits: its text goes back to the disk as last read or written. The disk is not
	 *  re-stamped, so a change made there since is still one, and the next catch-up or write meets it */
	revert(rel: string): void {
		const base = this.baseline.get(rel);
		if (base == null) return;
		this.discard(rel);
		this.disk.forget(rel);
		this.undo.get(rel)?.stopCapturing();
		this.fold(rel, base, undefined, DISK_ORIGIN);
	}

	/** catch every file up with its disk, or the ones `changed` names; a merge is saved at once */
	syncFromDisk(changed?: (absPath: string) => boolean): Promise<void> {
		return this.disk.syncAll([...this.seeded.keys()], changed);
	}

	/** the File Cache Conflict choice */
	resolveConflict(rel: string, choice: 'disk' | 'memory'): Promise<boolean> {
		return this.disk.resolve(rel, choice);
	}

	/** a rename moved a file or a folder: its text, history and unwritten edits go with it, and a session sees a move */
	move(fromRel: string, toRel: string): void {
		const moved = [...this.seeded.keys()].filter((rel) => rel === fromRel || rel.startsWith(fromRel + '/'));
		this.shared.transact(() => {
			for (const rel of moved) {
				const next = toRel + rel.slice(fromRel.length);
				if (next !== rel) this.moveOne(rel, next);
			}
			this.sharing.moveListed(fromRel, toRel);
		}, SEED_ORIGIN);
	}

	private moveOne(rel: string, next: string): void {
		const s = this.seeded.get(rel)!;
		const content = s.doc.getText(s.name).toString();
		const base = this.baseline.get(rel) ?? content;
		const unwritten = this.writes.pending.has(rel) || content !== base;
		const size = new TextEncoder().encode(content).byteLength;
		// a buffer left at the new name (a file deleted there earlier) has nothing to do with this one
		this.drop(next);
		if (this.shareable(next, size) !== (s.doc === this.shared)) {
			this.drop(rel);
			this.seed(next, content, s.eol, this.shareable(next, size) ? this.shared : this.local, size);
		} else {
			this.writes.forget(rel);
			this.disk.forget(rel);
			this.observers.get(rel)?.();
			this.observers.delete(rel);
			for (const map of [this.baseline, this.running, this.undo] as Map<string, unknown>[]) {
				if (map.has(rel)) map.set(next, map.get(rel));
				map.delete(rel);
			}
			this.seeded.delete(rel);
			this.seeded.set(next, s);
			this.keys.forget(rel);
			this.keys.remember(next);
			if (s.doc === this.shared) {
				const manifest = manifestOf(s.doc);
				manifest.set(rel, { ...(manifest.get(rel) ?? { kind: 'text', size }), gone: true, movedTo: next });
				manifest.set(next, textEntry(next, s.name, size));
			}
			this.observe(next);
		}
		this.baseline.set(next, base);
		if (unwritten) {
			this.writes.pending.add(next);
			this.writes.schedule(next);
		}
	}

	/** forget a file: its edits, its history, its place in the session */
	drop(rel: string): void {
		const s = this.seeded.get(rel);
		if (!s) return;
		this.writes.forget(rel);
		this.disk.forget(rel);
		this.baseline.delete(rel);
		this.running.delete(rel);
		this.observers.get(rel)?.();
		this.observers.delete(rel);
		this.undo.get(rel)?.destroy();
		this.undo.delete(rel);
		this.seeded.delete(rel);
		this.keys.forget(rel);
		s.doc.transact(() => {
			if (s.doc === this.shared) {
				const entry = manifestOf(s.doc).get(rel);
				if (entry) manifestOf(s.doc).set(rel, { ...entry, gone: true });
			}
			const t = s.doc.getText(s.name);
			if (t.length > 0) t.delete(0, t.length);
		}, SEED_ORIGIN);
	}

	/** one history per file, shared by every editor on it */
	undoOf(rel: string): Y.UndoManager | null {
		const t = this.text(rel);
		if (!t) return null;
		let um = this.undo.get(rel);
		if (!um) {
			um = createFileUndo(t, rel);
			this.undo.set(rel, um);
		}
		return um;
	}

	/** a session tracks who changed what, from the texts as they stand when it starts */
	track(on: boolean): void {
		this.tracking = on;
		this.running.clear();
		if (on) for (const [rel, s] of this.seeded) if (s.doc === this.shared) this.running.set(rel, s.doc.getText(s.name).toString());
	}

	/** a session starts: the shared files' histories start over, and the text they kept deleted stays here */
	forgetSharedHistory(): void {
		const histories = [...this.seeded].flatMap(([rel, s]) => (s.doc === this.shared && this.undo.get(rel) ? [this.undo.get(rel)!] : []));
		forgetDeleted(this.shared, histories);
	}

	/** the file's text lives in the doc a session syncs */
	inShared(rel: string): boolean {
		return this.seeded.get(rel)?.doc === this.shared;
	}

	/** a shareable file read by the session's own scan, into the shared doc */
	seedShared(rel: string, text: string, eol: Eol, size: number): void {
		this.seed(rel, text, eol, this.shared, size);
		void this.hooks.recordStamp?.(this.abs(rel));
	}

	destroy(): void {
		this.destroyed = true;
		this.writes.stop();
		for (const un of this.observers.values()) un();
		this.observers.clear();
		for (const um of this.undo.values()) um.destroy();
		this.undo.clear();
		this.fork.destroy();
		this.awareness.destroy();
		this.localAwareness.destroy();
		this.shared.destroy();
		this.local.destroy();
	}
}
