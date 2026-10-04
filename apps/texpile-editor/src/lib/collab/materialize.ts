// Host-side file glue: seeds the shared doc from the workspace, writes guest edits through to
// disk, and folds the host's own editor saves into the doc as minimal splices. The host is the
// only disk-writer in a session; guests only ever touch the Y.Doc.
//
// Injected fs so the whole thing runs headless in tests.

import type * as Y from 'yjs';
import { LATEX_SIDECAR_RE } from '$lib/workspace/buildArtifacts';
import { carryGestures, type TextSpan } from '$lib/comments/editGestures';
import { manifestOf, locksOf, textOf, type ManifestEntry } from './session';
import { LocalFork } from './localFork';
import { detectEol, fromLf, toLf, type Eol } from '$lib/workspace/edits/lineEndings';

export type MaterializeFs = {
	/** raw bytes: both the text/binary classification and the seeded body come from one read */
	readBytes(absPath: string): Promise<Uint8Array>;
	writeText(absPath: string, content: string): Promise<void>;
	/** flat file list, root-relative forward-slash paths. mtimeMs is only meaningful for binaries;
	 *  it becomes the manifest rev a guest uses to notice its cached copy went stale. */
	listFiles(root: string): Promise<{ rel: string; size: number; mtimeMs?: number }[]>;
};

// Which files co-edit as CRDT text is decided by CONTENT (decodeIfText below), not by an
// extension list: the old allow-list silently locked guests out of every file of a type nobody
// remembered to add - .typ sat missing for the whole life of typst support. Only two things
// still gate it: generated artifacts (below) and the size caps.
//
// Generated build products are rewritten wholesale by every compile, and a Y.Doc keeps history -
// routing them through the CRDT would grow every participant's session memory with dead compile
// output. They stay in the fetch-on-demand binary tier (guests still get the log and friends).
const GENERATED_EXT = LATEX_SIDECAR_RE;
// never shared: anything hidden (.git, .env, .npmrc) and dependency trees (credentials + noise). Everything
// else is shared, gated by size, so a guest can pull the output folder for local intellisense, the log, and the PDF.
const EXCLUDE = /(^|\/)(\.[^/]*|node_modules|__pycache__)(\/|$)/i;
// Name-based HINT that a file is source text, where content is not worth reading: the too-big-to-
// co-edit warning, and the tree scan's "text needs no stat" fast path. Never used to DENY co-edit.
const LIKELY_TEXT = /\.(tex|bib|cls|sty|txt|md|csv|dat|def|tikz|pgf|json|yml|yaml|toml|lco|ldf|clo|bst|typ)$/i;

export function isShared(rel: string) {
	return !EXCLUDE.test(rel);
}
export function isGeneratedArtifact(rel: string) {
	return GENERATED_EXT.test(rel);
}
export function isLikelyTextName(rel: string) {
	return LIKELY_TEXT.test(rel);
}

/**
 * The decoded text of `bytes`, or null when they are not losslessly text: a NUL in the first 8 KB
 * (the classic binary tell) or any invalid UTF-8. Lossless matters because this exact string is
 * what the materializer writes BACK to disk - a lossy decode of a PNG would corrupt the file on
 * the first write-through.
 */
export function decodeIfText(bytes: Uint8Array): string | null {
	const probe = Math.min(bytes.length, 8192);
	for (let i = 0; i < probe; i++) if (bytes[i] === 0) return null;
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return null;
	}
}

// co-edit cap; larger text is shared as binary (name + on-demand bytes). Frames are gzipped before
// they hit the relay (session.ts), and LaTeX compresses ~4x, so a file up to this size still clears
// the relay's per-message cap. Anything past it is view-only, and seed() reports it so the host can warn.
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_BINARY_BYTES = 100 * 1024 * 1024; // a binary/artifact larger than this isn't shared (guest-RAM guard)
const WRITE_DEBOUNCE_MS = 400;

export const SEED_ORIGIN = 'collab-seed';
export const EDIT_ORIGIN = 'collab-edit'; // a local editor's fold-in splice (host or guest)

// the shared set as a stable string: which paths exist and their kind, ignoring a binary's rev
// (an image reswap doesn't change any source binding) and lock state (that's a live read-only flip)
function manifestSignature(manifest: Y.Map<ManifestEntry>): string {
	const parts: string[] = [];
	for (const [rel, e] of manifest.entries()) parts.push(`${rel}:${e.kind}:${e.gone ? 1 : 0}`);
	return parts.sort().join('|');
}

/** where a Y.Text change landed, as spans of the text after it; a deletion is an empty span */
export function changedSpans(delta: Y.YTextEvent['delta'], before: string, after: string): TextSpan[] {
	const spans = deltaSpans(delta);
	// one edit is placed from the text, as a local one is: the writer's splice is one of several places it
	// could have gone, and the visual editor's puts a letter typed beside the same letter after it
	return spans.length === 1 ? carryGestures([], before, after) : spans;
}

function deltaSpans(delta: Y.YTextEvent['delta']): TextSpan[] {
	const out: TextSpan[] = [];
	let at = 0;
	for (const op of delta) {
		if (op.retain) at += op.retain;
		else if (op.insert !== undefined) {
			const to = at + (typeof op.insert === 'string' ? op.insert.length : 1);
			out.push({ from: at, to });
			at = to;
		} else if (op.delete) out.push({ from: at, to: at });
	}
	const merged: TextSpan[] = [];
	for (const g of out) {
		const prev = merged[merged.length - 1];
		if (prev && g.from <= prev.to) prev.to = Math.max(prev.to, g.to);
		else merged.push({ ...g });
	}
	return merged;
}

export class HostMaterializer {
	/** awaited once a file's changes settle, before the write-through, so whatever the write records lands first */
	onWrite: ((rel: string, content: string) => Promise<void>) | null = null;
	/** the peer a transaction origin came from, or null when it is this side's own */
	senderOf: ((origin: unknown) => number | null) | null = null;
	/** a peer's change to a shared file, as it applies: the file just before and just after it */
	onRemoteChange: ((rel: string, before: string, after: string, from: number, spans: TextSpan[]) => void) | null = null;
	private readonly writeTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly lastWritten = new Map<string, string>(); // rel -> LF content last synced with disk
	private readonly wrote = new Map<string, string>(); // rel -> LF content this side last wrote itself
	private readonly running = new Map<string, string>(); // rel -> LF content as of the last transaction
	private readonly endings = new Map<string, Eol>(); // rel -> how its lines ended on disk when this host read it
	private readonly observers = new Map<string, () => void>();
	// what this host listed; the manifest is not the authority, since any guest can write to it
	private listed = new Set<string>();
	private readonly fork: LocalFork;
	private destroyed = false;

	constructor(
		private readonly doc: Y.Doc,
		private readonly root: string,
		private readonly fs: MaterializeFs,
		private readonly joinPath: (root: string, rel: string) => string,
		private readonly onError?: (rel: string, err: unknown) => void
	) {
		this.fork = new LocalFork(doc);
	}

	/** scan + read every shared text file into the doc, in one transaction. Returns the text files
	 *  too large to co-edit (shared view-only instead), so the host can warn about them. */
	async seed(): Promise<{ oversizedText: string[] }> {
		const files = (await this.fs.listFiles(this.root)).filter((f) => isShared(f.rel));
		this.listed = new Set(files.map((f) => f.rel));
		const bodies = new Map<string, { text: string; eol: Eol }>();
		const oversizedText: string[] = [];
		for (const f of files) {
			if (isGeneratedArtifact(f.rel)) continue;
			if (f.size > MAX_TEXT_BYTES) {
				// too big to co-edit whatever it is; warn only where the name says it was source
				if (isLikelyTextName(f.rel)) oversizedText.push(f.rel);
				continue;
			}
			try {
				const bytes = await this.fs.readBytes(this.joinPath(this.root, f.rel));
				// tree scans don't always carry sizes; the cap re-applies after the read
				if (bytes.byteLength > MAX_TEXT_BYTES) {
					if (isLikelyTextName(f.rel)) oversizedText.push(f.rel);
					continue;
				}
				const raw = decodeIfText(bytes);
				if (raw !== null) bodies.set(f.rel, { text: toLf(raw), eol: detectEol(raw) });
			} catch (e) {
				this.onError?.(f.rel, e);
			}
		}
		this.doc.transact(() => {
			const manifest = manifestOf(this.doc);
			for (const f of files) {
				const body = bodies.get(f.rel);
				if (body) {
					manifest.set(f.rel, { kind: 'text', size: f.size });
					this.endings.set(f.rel, body.eol);
					const t = textOf(this.doc, f.rel);
					if (t.length > 0) t.delete(0, t.length);
					t.insert(0, body.text);
				} else if (f.size <= MAX_BINARY_BYTES) {
					manifest.set(f.rel, { kind: 'binary', size: f.size, rev: f.mtimeMs ?? 0 });
				}
			}
		}, SEED_ORIGIN);
		for (const rel of bodies.keys()) {
			this.lastWritten.set(rel, textOf(this.doc, rel).toString());
			this.observe(rel);
		}
		return { oversizedText };
	}

	/** watch one file's Y.Text; any change not caused by disk-side code schedules a write-back. */
	private observe(rel: string): void {
		if (this.observers.has(rel)) return;
		const t = textOf(this.doc, rel);
		this.running.set(rel, t.toString());
		const handler = (ev: Y.YTextEvent) => {
			const origin = ev.transaction.origin;
			const before = this.running.get(rel) ?? '';
			const after = t.toString();
			this.running.set(rel, after);
			if (origin === SEED_ORIGIN) return;
			const from = this.senderOf?.(origin) ?? null;
			if (from !== null && before !== after) this.onRemoteChange?.(rel, before, after, from, changedSpans(ev.delta, before, after));
			this.scheduleWrite(rel);
		};
		t.observe(handler);
		this.observers.set(rel, () => t.unobserve(handler));
	}

	private scheduleWrite(rel: string): void {
		if (this.destroyed) return;
		const prev = this.writeTimers.get(rel);
		if (prev) clearTimeout(prev);
		this.writeTimers.set(
			rel,
			setTimeout(() => {
				this.writeTimers.delete(rel);
				void this.writeNow(rel);
			}, WRITE_DEBOUNCE_MS)
		);
	}

	private async writeNow(rel: string): Promise<void> {
		if (this.destroyed) return;
		const entry = manifestOf(this.doc).get(rel);
		if (!entry || entry.kind !== 'text' || entry.gone) return;
		const content = textOf(this.doc, rel).toString();
		// even when the changes cancel out: what they moved is still recorded
		try {
			await this.onWrite?.(rel, content);
		} catch (e) {
			this.onError?.(rel, e);
		}
		if (this.lastWritten.get(rel) === content) return;
		try {
			await this.fs.writeText(this.joinPath(this.root, rel), fromLf(content, this.endings.get(rel) ?? '\n'));
			this.lastWritten.set(rel, content);
			this.wrote.set(rel, content);
		} catch (e) {
			this.onError?.(rel, e);
		}
	}

	/** flush a pending debounced write immediately (before the host opens/reads the file). */
	async flush(rel: string): Promise<void> {
		const timer = this.writeTimers.get(rel);
		if (timer) {
			clearTimeout(timer);
			this.writeTimers.delete(rel);
		}
		await this.writeNow(rel);
	}

	/** flush every pending debounced write (before the session ends, so guest edits aren't lost). */
	async flushAll(): Promise<void> {
		const pending = [...this.writeTimers.keys()];
		for (const rel of pending) {
			const timer = this.writeTimers.get(rel);
			if (timer) clearTimeout(timer);
			this.writeTimers.delete(rel);
		}
		// writeNow early-returns once destroyed, so this must run before destroy()
		for (const rel of pending) await this.writeNow(rel);
	}

	/** fold a host editor save into the doc; content is LF, already on disk, and `lfBefore` is the text it was made to */
	hostEdit(rel: string, lfContent: string, lfBefore?: string): void {
		const entry = manifestOf(this.doc).get(rel);
		if (!entry || entry.kind !== 'text') return;
		this.lastWritten.set(rel, lfContent); // the editor's own save already wrote the disk
		this.fork.fold(textOf(this.doc, rel), lfContent, lfBefore, EDIT_ORIGIN);
	}

	/** re-sync the manifest after host-side file ops (create/delete/rename/import). Returns whether
	 *  the shared set actually changed, so the caller only rebinds editors when it did (a plain
	 *  tree refresh on window focus or after a compile leaves the set untouched). */
	async syncFromTree(): Promise<boolean> {
		const files = (await this.fs.listFiles(this.root)).filter((f) => isShared(f.rel));
		const manifest = manifestOf(this.doc);
		const seen = new Set(files.map((f) => f.rel));
		this.listed = seen;
		const sigBefore = manifestSignature(manifest);
		const newTexts: string[] = [];
		const bodies = new Map<string, { text: string; eol: Eol }>();
		for (const f of files) {
			const existing = manifest.get(f.rel);
			if (!existing || existing.gone) {
				if (!isGeneratedArtifact(f.rel) && f.size <= MAX_TEXT_BYTES) {
					try {
						const bytes = await this.fs.readBytes(this.joinPath(this.root, f.rel));
						const raw = bytes.byteLength <= MAX_TEXT_BYTES ? decodeIfText(bytes) : null;
						if (raw !== null) {
							bodies.set(f.rel, { text: toLf(raw), eol: detectEol(raw) });
							newTexts.push(f.rel);
						}
					} catch (e) {
						this.onError?.(f.rel, e);
					}
				}
			}
		}
		this.doc.transact(() => {
			for (const f of files) {
				const existing = manifest.get(f.rel);
				const body = bodies.get(f.rel);
				if (body) {
					manifest.set(f.rel, { kind: 'text', size: f.size });
					this.endings.set(f.rel, body.eol);
					const t = textOf(this.doc, f.rel);
					if (t.length > 0) t.delete(0, t.length);
					t.insert(0, body.text);
				} else if ((!existing || existing.gone) && f.size <= MAX_BINARY_BYTES) {
					manifest.set(f.rel, { kind: 'binary', size: f.size, rev: f.mtimeMs ?? 0 });
				} else if (existing?.kind === 'binary') {
					// a replaced image keeps its path, so the rev is the only thing telling a guest to refetch
					manifest.set(f.rel, { ...existing, size: f.size, rev: f.mtimeMs ?? existing.rev ?? 0 });
				}
			}
			for (const [rel, entry] of manifest.entries()) {
				if (!seen.has(rel) && !entry.gone) {
					manifest.set(rel, { ...entry, gone: true });
					const t = textOf(this.doc, rel);
					if (t.length > 0) t.delete(0, t.length);
				}
			}
		}, SEED_ORIGIN);
		for (const rel of newTexts) {
			this.lastWritten.set(rel, textOf(this.doc, rel).toString());
			this.observe(rel);
		}
		return manifestSignature(manifest) !== sigBefore;
	}

	/** what this side last wrote to the file at rel for the session (LF), once, or null */
	takeWrite(rel: string): string | null {
		const content = this.wrote.get(rel) ?? null;
		this.wrote.delete(rel);
		return content;
	}

	/** whether this host shares the file at rel */
	sharesFile(rel: string): boolean {
		return this.listed.has(rel);
	}

	/** whether rel is a folder holding files this host shares */
	sharesFolder(rel: string): boolean {
		const prefix = rel + '/';
		for (const f of this.listed) if (f.startsWith(prefix)) return true;
		return false;
	}

	/** mark a file as held by the host's visual editor (guests go read-only on it). */
	setHostLock(rel: string | null, prevRel?: string | null): void {
		this.doc.transact(() => {
			const locks = locksOf(this.doc);
			if (prevRel && locks.has(prevRel)) locks.delete(prevRel);
			if (rel) locks.set(rel, this.doc.clientID);
		}, EDIT_ORIGIN);
	}

	destroy(): void {
		this.destroyed = true;
		for (const timer of this.writeTimers.values()) clearTimeout(timer);
		this.writeTimers.clear();
		for (const un of this.observers.values()) un();
		this.observers.clear();
		this.fork.destroy();
	}
}
