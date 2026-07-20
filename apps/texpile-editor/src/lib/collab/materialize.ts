// Host-side file glue: seeds the shared doc from the workspace, writes guest edits through to
// disk, and folds the host's own editor saves into the doc as minimal splices. The host is the
// only disk-writer in a session; guests only ever touch the Y.Doc.
//
// Injected fs so the whole thing runs headless in tests (and, later, on a server).

import type * as Y from 'yjs';
import { manifestOf, locksOf, textOf } from './session';

export interface MaterializeFs {
	readText(absPath: string): Promise<string>;
	writeText(absPath: string, content: string): Promise<void>;
	/** flat file list, root-relative forward-slash paths. */
	listFiles(root: string): Promise<{ rel: string; size: number }[]>;
}

const TEXT_EXT = /\.(tex|bib|cls|sty|txt|md|csv|dat|bbl|def|tikz|pgf|json|yml|yaml|toml|lco|ldf|clo|bst)$/i;
// never share compile artifacts or VCS internals
const EXCLUDE =
	/(^|\/)(\.git|\.svn|node_modules|__pycache__|output)(\/|$)|\.(aux|log|synctex(\.gz)?|fls|fdb_latexmk|out|toc|lof|lot|blg|bcf|run\.xml|nav|snm|vrb|xdv|dvi)$/i;

export const isTextFile = (rel: string) => TEXT_EXT.test(rel);
export const isShared = (rel: string) => !EXCLUDE.test(rel);

const MAX_TEXT_BYTES = 2 * 1024 * 1024; // a text file bigger than this is shared as binary (viewable name, no body)
const WRITE_DEBOUNCE_MS = 400;

export const SEED_ORIGIN = 'collab-seed';
export const HOST_EDIT_ORIGIN = 'collab-host-edit';

const toLf = (s: string) => s.replace(/\r\n?/g, '\n');
const detectEol = (s: string): '\r\n' | '\n' => (s.includes('\r\n') ? '\r\n' : '\n');
const fromLf = (s: string, eol: '\r\n' | '\n') => (eol === '\r\n' ? s.replace(/\n/g, '\r\n') : s);

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

	/** scan + read every shared text file into the doc, in one transaction. */
	async seed(): Promise<void> {
		const files = (await this.fs.listFiles(this.root)).filter((f) => isShared(f.rel));
		const bodies = new Map<string, { text: string; eol: '\r\n' | '\n' }>();
		for (const f of files) {
			if (isTextFile(f.rel) && f.size <= MAX_TEXT_BYTES) {
				try {
					const raw = await this.fs.readText(this.joinPath(this.root, f.rel));
					// tree scans don't always carry sizes; the cap re-applies after the read
					if (raw.length <= MAX_TEXT_BYTES) bodies.set(f.rel, { text: toLf(raw), eol: detectEol(raw) });
				} catch (e) {
					this.onError?.(f.rel, e);
				}
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
				} else {
					manifest.set(f.rel, { kind: 'binary', size: f.size });
				}
			}
		}, SEED_ORIGIN);
		for (const rel of bodies.keys()) {
			this.lastWritten.set(rel, textOf(this.doc, rel).toString());
			this.observe(rel);
		}
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
		}, HOST_EDIT_ORIGIN);
	}

	/** re-sync the manifest after host-side file ops (create/delete/rename/import). */
	async syncFromTree(): Promise<void> {
		const files = (await this.fs.listFiles(this.root)).filter((f) => isShared(f.rel));
		const manifest = manifestOf(this.doc);
		const seen = new Set(files.map((f) => f.rel));
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
				} else if (!existing || existing.gone) {
					manifest.set(f.rel, { kind: 'binary', size: f.size });
				} else if (existing.kind === 'binary') {
					manifest.set(f.rel, { ...existing, size: f.size });
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
	}

	/** mark a file as held by the host's visual editor (guests go read-only on it). */
	setHostLock(rel: string | null, prevRel?: string | null): void {
		this.doc.transact(() => {
			const locks = locksOf(this.doc);
			if (prevRel && locks.has(prevRel)) locks.delete(prevRel);
			if (rel) locks.set(rel, this.doc.clientID);
		}, HOST_EDIT_ORIGIN);
	}

	destroy(): void {
		this.destroyed = true;
		for (const timer of this.writeTimers.values()) clearTimeout(timer);
		this.writeTimers.clear();
		for (const un of this.observers.values()) un();
		this.observers.clear();
	}
}
