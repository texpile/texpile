// Host-side file glue: seeds the shared doc from the workspace, writes guest edits through to
// disk, and folds the host's own editor saves into the doc as minimal splices. The host is the
// only disk-writer in a session; guests only ever touch the Y.Doc.
//
// Injected fs so the whole thing runs headless in tests (and, later, on a server).

import type * as Y from 'yjs';
import { manifestOf, locksOf, textOf, type ManifestEntry } from './session';

export interface MaterializeFs {
	readText(absPath: string): Promise<string>;
	writeText(absPath: string, content: string): Promise<void>;
	/** flat file list, root-relative forward-slash paths. mtimeMs is only meaningful for binaries;
	 *  it becomes the manifest rev a guest uses to notice its cached copy went stale. */
	listFiles(root: string): Promise<{ rel: string; size: number; mtimeMs?: number }[]>;
}

// files co-edited as text through the CRDT (source only). Generated products (.aux, .log, .bbl,
// the compiled .pdf, ...) are shared too, but as binary the guest fetches on demand and never edits.
const TEXT_EXT = /\.(tex|bib|cls|sty|txt|md|csv|dat|def|tikz|pgf|json|yml|yaml|toml|lco|ldf|clo|bst)$/i;
// never shared: VCS internals and dependency trees (credentials + noise). Everything else is shared,
// gated by size, so a guest can pull the output folder for local intellisense, the log, and the PDF.
const EXCLUDE = /(^|\/)(\.git|\.svn|node_modules|__pycache__)(\/|$)/i;

export const isShared = (rel: string) => !EXCLUDE.test(rel);
// co-editable source text (drives CRDT sync); everything else shared is served as bytes on demand
export const isTextFile = (rel: string) => TEXT_EXT.test(rel);

// co-edit cap; larger text is shared as binary (name + on-demand bytes). Frames are gzipped before
// they hit the relay (session.ts), and LaTeX compresses ~4x, so a file up to this size still clears
// the relay's per-message cap. Anything past it is view-only, and seed() reports it so the host can warn.
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_BINARY_BYTES = 100 * 1024 * 1024; // a binary/artifact larger than this isn't shared (guest-RAM guard)
const WRITE_DEBOUNCE_MS = 400;

export const SEED_ORIGIN = 'collab-seed';
export const EDIT_ORIGIN = 'collab-edit'; // a local editor's fold-in splice (host or guest)

const toLf = (s: string) => s.replace(/\r\n?/g, '\n');
const detectEol = (s: string): '\r\n' | '\n' => (s.includes('\r\n') ? '\r\n' : '\n');
const fromLf = (s: string, eol: '\r\n' | '\n') => (eol === '\r\n' ? s.replace(/\n/g, '\r\n') : s);

// the shared set as a stable string: which paths exist and their kind, ignoring a binary's rev
// (an image reswap doesn't change any source binding) and lock state (that's a live read-only flip)
function manifestSignature(manifest: Y.Map<ManifestEntry>): string {
	const parts: string[] = [];
	for (const [rel, e] of manifest.entries()) parts.push(`${rel}:${e.kind}:${e.gone ? 1 : 0}`);
	return parts.sort().join('|');
}

/** minimal single-splice diff (common prefix/suffix trim); enough for editor-shaped changes. */
export function spliceDiff(oldStr: string, newStr: string): { index: number; remove: number; insert: string } | null {
	if (oldStr === newStr) return null;
	let start = 0;
	const maxStart = Math.min(oldStr.length, newStr.length);
	while (start < maxStart && oldStr[start] === newStr[start]) start++;
	let endOld = oldStr.length;
	let endNew = newStr.length;
	// suffix must not overlap the prefix (classic "abab" pitfall)
	while (endOld > start && endNew > start && oldStr[endOld - 1] === newStr[endNew - 1]) {
		endOld--;
		endNew--;
	}
	return { index: start, remove: endOld - start, insert: newStr.slice(start, endNew) };
}

export class HostMaterializer {
	private readonly writeTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly lastWritten = new Map<string, string>(); // rel -> LF content last synced with disk
	private readonly observers = new Map<string, () => void>();
	private destroyed = false;

	constructor(
		private readonly doc: Y.Doc,
		private readonly root: string,
		private readonly fs: MaterializeFs,
		private readonly joinPath: (root: string, rel: string) => string,
		private readonly onError?: (rel: string, err: unknown) => void
	) {}

	/** scan + read every shared text file into the doc, in one transaction. Returns the text files
	 *  too large to co-edit (shared view-only instead), so the host can warn about them. */
	async seed(): Promise<{ oversizedText: string[] }> {
		const files = (await this.fs.listFiles(this.root)).filter((f) => isShared(f.rel));
		const bodies = new Map<string, { text: string; eol: '\r\n' | '\n' }>();
		const oversizedText: string[] = [];
		for (const f of files) {
			if (!isTextFile(f.rel)) continue;
			if (f.size > MAX_TEXT_BYTES) {
				oversizedText.push(f.rel);
				continue;
			}
			try {
				const raw = await this.fs.readText(this.joinPath(this.root, f.rel));
				// tree scans don't always carry sizes; the cap re-applies after the read
				if (raw.length <= MAX_TEXT_BYTES) bodies.set(f.rel, { text: toLf(raw), eol: detectEol(raw) });
				else oversizedText.push(f.rel);
			} catch (e) {
				this.onError?.(f.rel, e);
			}
		}
		this.doc.transact(() => {
			const manifest = manifestOf(this.doc);
			for (const f of files) {
				const body = bodies.get(f.rel);
				if (body) {
					manifest.set(f.rel, { kind: 'text', size: f.size, eol: body.eol });
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
		const handler = (ev: Y.YTextEvent) => {
			const origin = ev.transaction.origin;
			if (origin === SEED_ORIGIN) return;
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
		if (this.lastWritten.get(rel) === content) return;
		try {
			await this.fs.writeText(this.joinPath(this.root, rel), fromLf(content, entry.eol ?? '\n'));
			this.lastWritten.set(rel, content);
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

	/** fold a host editor save into the doc as a minimal splice. content is LF, already on disk. */
	hostEdit(rel: string, lfContent: string): void {
		const entry = manifestOf(this.doc).get(rel);
		if (!entry || entry.kind !== 'text') return;
		const t = textOf(this.doc, rel);
		const diff = spliceDiff(t.toString(), lfContent);
		this.lastWritten.set(rel, lfContent); // the editor's own save already wrote the disk
		if (!diff) return;
		this.doc.transact(() => {
			if (diff.remove > 0) t.delete(diff.index, diff.remove);
			if (diff.insert) t.insert(diff.index, diff.insert);
		}, EDIT_ORIGIN);
	}

	/** re-sync the manifest after host-side file ops (create/delete/rename/import). Returns whether
	 *  the shared set actually changed, so the caller only rebinds editors when it did (a plain
	 *  tree refresh on window focus or after a compile leaves the set untouched). */
	async syncFromTree(): Promise<boolean> {
		const files = (await this.fs.listFiles(this.root)).filter((f) => isShared(f.rel));
		const manifest = manifestOf(this.doc);
		const seen = new Set(files.map((f) => f.rel));
		const sigBefore = manifestSignature(manifest);
		const newTexts: string[] = [];
		const bodies = new Map<string, { text: string; eol: '\r\n' | '\n' }>();
		for (const f of files) {
			const existing = manifest.get(f.rel);
			if (!existing || existing.gone) {
				if (isTextFile(f.rel) && f.size <= MAX_TEXT_BYTES) {
					try {
						const raw = await this.fs.readText(this.joinPath(this.root, f.rel));
						if (raw.length <= MAX_TEXT_BYTES) {
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
					manifest.set(f.rel, { kind: 'text', size: f.size, eol: body.eol });
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
	}
}
