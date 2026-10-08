// every text file the folder has open, as CRDT text, and the one writer that puts it on disk
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { LocalFork, splice } from '$lib/collab/localFork';
import { spliceDiff } from '$lib/collab/spliceDiff';
import { manifestOf, textOf } from '$lib/collab/session';
import {
	DISK_ORIGIN,
	EDIT_ORIGIN,
	MAX_TEXT_BYTES,
	SEED_ORIGIN,
	changedSpans,
	decodeIfText,
	isGeneratedArtifact,
	isShared
} from '$lib/collab/sharedFiles';
import { detectEol, fromLf, toLf, type Eol } from '$lib/workspace/edits/lineEndings';
import type { TextSpan } from '$lib/comments/editGestures';
import { createFileUndo, forgetDeleted, joinLastStep } from './fileUndo';
import { BufferSharing } from './bufferSharing';
import type { TextBuffersFs, WriteHooks } from './writeHooks';

export type { TextBuffersFs, WriteHooks } from './writeHooks';

export const AUTOSAVE_MS = 1500;

type Seeded = { doc: Y.Doc; eol: Eol };

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
	private readonly loading = new Map<string, Promise<Y.Text | null>>();
	/** rel -> LF content last synced with disk */
	private readonly baseline = new Map<string, string>();
	/** changed since the last write and not yet handed to the chain */
	private readonly pending = new Set<string>();
	/** a write found the file changed on disk underneath it; its edits wait for someone to choose */
	private readonly refused = new Set<string>();
	private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
	/** writes that failed in a row, per file: the next try waits longer each time */
	private readonly failures = new Map<string, number>();
	private readonly observers = new Map<string, () => void>();
	private readonly undo = new Map<string, Y.UndoManager>();
	/** rel -> LF content as of the last transaction, kept only while a session runs */
	private readonly running = new Map<string, string>();
	private tracking = false;
	private chain: Promise<unknown> = Promise.resolve();
	private destroyed = false;

	constructor(
		private readonly root: string,
		private readonly fs: TextBuffersFs,
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
		return s ? textOf(s.doc, rel) : null;
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
		return this.pending.has(rel);
	}

	/** files whose edits are not on disk: still waiting to be written, held back, or a write failed */
	get unwrittenFiles(): string[] {
		return [...this.seeded.keys()].filter((rel) => this.pending.has(rel) || this.isDirty(rel));
	}

	/** files whose edits a change on disk keeps from being written */
	get refusedFiles(): string[] {
		return [...this.refused];
	}

	/** the file's text, read from disk the first time; null when it is not lossless UTF-8 text */
	async ensure(rel: string): Promise<Y.Text | null> {
		if (this.seeded.has(rel)) {
			await this.syncOne(rel);
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
		const raw = decodeIfText(bytes);
		if (raw === null) return null;
		const doc = this.shareable(rel, bytes.byteLength) ? this.shared : this.local;
		this.seed(rel, toLf(raw), detectEol(raw), doc, bytes.byteLength);
		void this.hooks.recordStamp?.(this.abs(rel));
		return this.text(rel);
	}

	private shareable(rel: string, size: number): boolean {
		return !outside(rel) && isShared(rel) && !isGeneratedArtifact(rel) && size <= MAX_TEXT_BYTES;
	}

	private seed(rel: string, text: string, eol: Eol, doc: Y.Doc, size: number): void {
		doc.transact(() => {
			if (doc === this.shared) manifestOf(doc).set(rel, { kind: 'text', size });
			const t = textOf(doc, rel);
			if (t.length > 0) t.delete(0, t.length);
			t.insert(0, text);
		}, SEED_ORIGIN);
		this.seeded.set(rel, { doc, eol });
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
			this.pending.add(rel);
			this.schedule(rel);
		};
		t.observe(handler);
		this.observers.set(rel, () => t.unobserve(handler));
	}

	/** debounce the next write; one held off waits for the conflict flow or Ctrl+S */
	private schedule(rel: string, delay = AUTOSAVE_MS): void {
		if (this.destroyed) return;
		const prev = this.timers.get(rel);
		if (prev) clearTimeout(prev);
		this.timers.delete(rel);
		if (this.hooks.heldOff?.(this.abs(rel))) return;
		this.timers.set(
			rel,
			setTimeout(() => {
				this.timers.delete(rel);
				void this.flush(rel);
			}, delay)
		);
	}

	/** resume a file autosave held off */
	resume(rel: string): void {
		if (this.pending.has(rel)) this.schedule(rel);
	}

	private cancel(rel: string): void {
		const timer = this.timers.get(rel);
		if (timer) clearTimeout(timer);
		this.timers.delete(rel);
	}

	/** write a file's pending change now; resolves true once it is on disk (or nothing was pending) */
	flush(rel: string): Promise<boolean> {
		this.cancel(rel);
		if (!this.pending.has(rel)) return this.chain.then(() => true);
		this.pending.delete(rel);
		return this.enqueue(rel, false, false);
	}

	/** write every pending change and wait for the writes to land */
	async flushAll(): Promise<void> {
		for (const rel of [...this.pending]) void this.flush(rel);
		await this.chain;
	}

	/** Ctrl+S: write now, said aloud; `force` writes over a change on disk the user has seen */
	save(rel: string, force = false): Promise<boolean> {
		this.cancel(rel);
		this.pending.delete(rel);
		return this.enqueue(rel, true, force);
	}

	/** resolves once every queued write has landed */
	whenIdle(): Promise<void> {
		return this.chain.then(() => undefined);
	}

	/** stop the pending write of a file; its text keeps the change */
	discard(rel: string): void {
		this.cancel(rel);
		this.pending.delete(rel);
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
			if (await this.heldBack(rel, abs, notify, force)) return false;
			const verified = await this.hooks.verify?.(abs, content).catch(() => null);
			if (!stillHere()) return false;
			if (verified != null && verified !== content) {
				const was = content;
				// the check's rewrite is how the edit it saves is written, so it undoes with that edit
				joinLastStep(this.undoOf(rel)!, () => this.fold(rel, verified, was));
				content = verified;
			}
			await this.beforeWrite(abs, content);
			// again right before the bytes go: the save check takes a while on a long paper
			if (!stillHere() || (await this.heldBack(rel, abs, notify, force))) return false;
			await this.fs.writeText(abs, fromLf(content, this.eolOf(rel)));
			await this.hooks.recordStamp?.(abs);
			this.baseline.set(rel, content);
			this.refused.delete(rel);
			this.failures.delete(rel);
			this.hooks.afterWrite?.(abs, content);
			if (notify) this.hooks.saved?.(abs);
			return true;
		} catch (e) {
			// a write that did not land keeps the change pending and tries again on its own: a file a sync client or a
			// virus scanner holds for a moment would otherwise wait for the next keystroke
			if (stillHere()) {
				this.pending.add(rel);
				const tries = (this.failures.get(rel) ?? 0) + 1;
				this.failures.set(rel, tries);
				this.schedule(rel, Math.min(60_000, AUTOSAVE_MS * 2 ** tries));
			}
			this.hooks.failed?.(abs, e);
			return false;
		}
	}

	/** the file changed on disk since this side knew it: the edit waits for someone to choose. A file deleted
	 *  outside comes back only on Ctrl+S */
	private async heldBack(rel: string, abs: string, notify: boolean, force: boolean): Promise<boolean> {
		if (force) return false;
		const disk = await this.hooks.diskChanged?.(abs);
		if (!disk || (disk === 'gone' && notify)) return false;
		this.pending.add(rel);
		this.refused.add(rel);
		this.hooks.conflict?.(abs, notify);
		return true;
	}

	/** a comment log that cannot be written must not keep the text from being saved */
	private async beforeWrite(abs: string, content: string): Promise<void> {
		await this.hooks.beforeWrite?.(abs, content).catch(() => undefined);
	}

	/** carry an editor's change from `before` to `content` into the file's text; with no `before` it goes in whole */
	fold(rel: string, content: string, before?: string, origin: unknown = EDIT_ORIGIN): void {
		const s = this.seeded.get(rel);
		if (!s) return;
		const t = textOf(s.doc, rel);
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
		this.refused.delete(rel);
		if (eol) s.eol = eol;
		this.baseline.set(rel, text);
		this.fold(rel, text, undefined, DISK_ORIGIN);
		void this.hooks.recordStamp?.(this.abs(rel));
	}

	/** drop a file's unwritten edits: its text goes back to the disk as last read or written. The disk is not
	 *  re-stamped, so a change made there since is still one, and the next catch-up or write meets it */
	revert(rel: string): void {
		const base = this.baseline.get(rel);
		if (base == null) return;
		this.discard(rel);
		this.refused.delete(rel);
		this.fold(rel, base, undefined, DISK_ORIGIN);
	}

	/** catch every file nobody holds unwritten edits in up with its disk; `skip` is the open file, which asks */
	async syncFromDisk(skip?: string): Promise<void> {
		for (const rel of [...this.seeded.keys()]) if (rel !== skip) await this.syncOne(rel);
	}

	private async syncOne(rel: string): Promise<void> {
		const abs = this.abs(rel);
		if (!(await this.hooks.diskChanged?.(abs))) return;
		let bytes: Uint8Array;
		try {
			bytes = await this.fs.readBytes(abs);
		} catch {
			// gone from disk: a file nobody holds edits in goes too, so opening the name again reads afresh
			if (!this.pending.has(rel) && !this.isDirty(rel)) this.drop(rel);
			return;
		}
		const raw = decodeIfText(bytes);
		if (raw === null || !this.seeded.has(rel)) return;
		const disk = toLf(raw);
		if (disk === this.baseline.get(rel)) {
			await this.hooks.recordStamp?.(abs);
			return;
		}
		// unwritten edits stay; their write finds the file changed and raises the conflict
		if (this.pending.has(rel) || this.isDirty(rel)) return;
		this.adoptDisk(rel, disk, detectEol(raw));
	}

	/** a rename moved a file or a folder: its text, unwritten edits included, goes with it */
	move(fromRel: string, toRel: string): void {
		const moved = [...this.seeded.keys()].filter((rel) => rel === fromRel || rel.startsWith(fromRel + '/'));
		for (const rel of moved) {
			const next = toRel + rel.slice(fromRel.length);
			const t = this.text(rel)!;
			const content = t.toString();
			const base = this.baseline.get(rel) ?? content;
			const eol = this.eolOf(rel);
			const unwritten = this.pending.has(rel) || content !== base;
			this.drop(rel);
			// a buffer left at the new name (a file deleted there earlier) has nothing to do with this one
			this.drop(next);
			const size = new TextEncoder().encode(content).byteLength;
			this.seed(next, content, eol, this.shareable(next, size) ? this.shared : this.local, size);
			this.baseline.set(next, base);
			if (unwritten) {
				this.pending.add(next);
				this.schedule(next);
			}
		}
	}

	/** forget a file: its edits, its history, its place in the session */
	drop(rel: string): void {
		const s = this.seeded.get(rel);
		if (!s) return;
		this.cancel(rel);
		this.pending.delete(rel);
		this.refused.delete(rel);
		this.failures.delete(rel);
		this.baseline.delete(rel);
		this.running.delete(rel);
		this.observers.get(rel)?.();
		this.observers.delete(rel);
		this.undo.get(rel)?.destroy();
		this.undo.delete(rel);
		this.seeded.delete(rel);
		s.doc.transact(() => {
			if (s.doc === this.shared) {
				const entry = manifestOf(s.doc).get(rel);
				if (entry) manifestOf(s.doc).set(rel, { ...entry, gone: true });
			}
			const t = textOf(s.doc, rel);
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
		if (on) for (const [rel, s] of this.seeded) if (s.doc === this.shared) this.running.set(rel, textOf(s.doc, rel).toString());
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
		for (const timer of this.timers.values()) clearTimeout(timer);
		this.timers.clear();
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
