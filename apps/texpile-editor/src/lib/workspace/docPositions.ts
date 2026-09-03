// Where the caret and viewport were, per file. Restored when a tab is switched back to, and when
// the folder is reopened in a later session.
//
// Kept for RECENT files, not just open tabs: closing a tab and reopening it later should still land
// where you were, which is what people mean by "remembers my place". That is why close() is not
// wired to tab closing - only rename/delete/prune touch entries, and an LRU cap bounds the rest.
//
// Line/column rather than a character offset, deliberately. This is a folder editor: the file can
// change on disk between sessions, and an offset that drifts lands you mid-word somewhere unrelated
// while a line number lands you roughly where you meant.
import { samePath } from './fileSystem';
import { getFolder, updateFolder } from '$lib/storage/workspaces';

/** past this many files per folder the oldest are evicted; entries are ~60 bytes each */
const MAX_ENTRIES = 200;

export type DocPosition = {
	/** 0-indexed, as CodeMirror's line numbers are 1-indexed and this survives round-trips better */
	row: number;
	column: number;
	/** 1-indexed first visible line, for restoring the scroll offset */
	firstVisibleLine: number;
	/** px the viewport top sits INTO that line, so the restore is exact rather than line-snapped.
	 *  Anchored to the line rather than stored as a raw scrollTop: CodeMirror estimates the height of
	 *  every line it has not measured, so an absolute pixel offset means something different on a
	 *  fresh mount than it did when it was saved. Relative to a line, the worst case is one line. */
	offset?: number;
	/** last touched, for LRU eviction */
	at: number;
};

function sepOf(p: string) {
	return p.includes('\\') ? '\\' : '/';
}

class DocPositionsStore {
	private root: string | null = null;
	private persistable = false;
	private byRel = new Map<string, DocPosition>();
	/** the file whose position was last written by a jump, so its landing flashes once. Memory
	 *  only: persisted, it would flash again the next time the folder opened. */
	private jumpRel: string | null = null;

	/** folder (re)opened: load this root's saved positions. Mirrors tabs.bind. */
	bind(root: string | null, persist: boolean): void {
		this.root = root;
		this.persistable = persist && !!root && typeof localStorage !== 'undefined';
		this.byRel = new Map();
		this.jumpRel = null;
		if (!this.persistable || !root) return;
		const mine = getFolder(root).positions;
		if (mine && typeof mine === 'object') {
			for (const [rel, pos] of Object.entries(mine)) {
				if (isPosition(pos)) this.byRel.set(rel, pos);
			}
		}
	}

	private relOf(path: string): string | null {
		if (!this.root) return null;
		const prefix = this.root + sepOf(this.root);
		if (!samePath(path.slice(0, prefix.length), prefix)) return null;
		return path.slice(prefix.length).replace(/\\/g, '/');
	}

	private persist(): void {
		if (!this.persistable || !this.root) return;
		const positions = Object.fromEntries(this.byRel);
		updateFolder(this.root, (draft) => {
			draft.positions = positions;
		});
	}

	/** drop the least recently touched entries once the cap is passed */
	private evict(): void {
		if (this.byRel.size <= MAX_ENTRIES) return;
		const oldestFirst = [...this.byRel.entries()].sort((a, b) => a[1].at - b[1].at);
		for (const [rel] of oldestFirst.slice(0, this.byRel.size - MAX_ENTRIES)) this.byRel.delete(rel);
	}

	get(path: string): DocPosition | null {
		const rel = this.relOf(path);
		return rel ? (this.byRel.get(rel) ?? null) : null;
	}

	set(path: string, pos: Omit<DocPosition, 'at'>, opts?: { jump?: boolean }): void {
		const rel = this.relOf(path);
		if (!rel) return;
		this.byRel.set(rel, { ...pos, at: Date.now() });
		// a plain write to the same file supersedes a jump that never got restored
		this.jumpRel = opts?.jump ? rel : this.jumpRel === rel ? null : this.jumpRel;
		this.evict();
		this.persist();
	}

	/** whether this file's position was written by a jump; asking clears it */
	takeJump(path: string): boolean {
		const rel = this.relOf(path);
		if (rel === null || this.jumpRel !== rel) return false;
		this.jumpRel = null;
		return true;
	}

	/** a rename/move retargets the entry, or every entry under it when a folder moved */
	rename(from: string, to: string): void {
		const relFrom = this.relOf(from);
		const relTo = this.relOf(to);
		if (relFrom === null || relTo === null) return;
		const prefix = relFrom + '/';
		const next = new Map<string, DocPosition>();
		for (const [rel, pos] of this.byRel) {
			if (rel === relFrom) next.set(relTo, pos);
			else if (rel.startsWith(prefix)) next.set(relTo + rel.slice(relFrom.length), pos);
			else next.set(rel, pos);
		}
		this.byRel = next;
		this.persist();
	}

	/** a deleted file or folder takes its entries with it */
	forget(path: string): void {
		const rel = this.relOf(path);
		if (rel === null) return;
		const prefix = rel + '/';
		let changed = false;
		for (const key of [...this.byRel.keys()]) {
			if (key === rel || key.startsWith(prefix)) {
				this.byRel.delete(key);
				changed = true;
			}
		}
		if (changed) this.persist();
	}
}

function isPosition(v: unknown): v is DocPosition {
	if (!v || typeof v !== 'object') return false;
	const p = v as Record<string, unknown>;
	// offset is optional: entries written before it existed must still load
	return typeof p.row === 'number' && typeof p.column === 'number' && typeof p.firstVisibleLine === 'number' && typeof p.at === 'number';
}

export const docPositions = new DocPositionsStore();

/** resolve a stored position against the document actually on screen, which may have changed since.
 *  Clamps to the last line rather than discarding: landing near where you were beats landing at the
 *  top, and a shrunk file is the common case (a section moved out to its own file). */
export function resolvePosition(
	pos: DocPosition,
	doc: { lines: number; line(n: number): { from: number; length: number }; length: number }
): { cursor: number; scroll: number } {
	const lineNumber = Math.min(Math.max(1, pos.row + 1), doc.lines);
	const line = doc.line(lineNumber);
	const cursor = Math.min(line.from + Math.max(0, pos.column), line.from + line.length);
	const firstVisible = Math.min(Math.max(1, pos.firstVisibleLine), doc.lines);
	return { cursor: Math.min(cursor, doc.length), scroll: doc.line(firstVisible).from };
}

// The visual editor works in file OFFSETS (the orig.start stamps the importer puts on blocks) while
// this record is line/column, so these two are the whole conversion between them. Both modes write
// ONE record: a ProseMirror position would be meaningless the moment the doc is re-parsed, which
// happens on every entry to visual mode, whereas a place in the file survives.

/** row (0-indexed) and column for a file offset. */
export function offsetToRowCol(text: string, offset: number): { row: number; column: number } {
	const at = Math.min(Math.max(0, offset), text.length);
	let row = 0;
	let lineStart = 0;
	// indexOf rather than a charCodeAt loop: this runs over whole papers
	for (let i = text.indexOf('\n'); i >= 0 && i < at; i = text.indexOf('\n', i + 1)) {
		row++;
		lineStart = i + 1;
	}
	return { row, column: at - lineStart };
}

/** file offset for a row/column, clamped to the line and to the end of a file that has since shrunk
 *  (landing near where you were beats landing at the top - same rule resolvePosition follows). */
export function rowColToOffset(text: string, row: number, column: number): number {
	let start = 0;
	for (let r = 0; r < row; r++) {
		const nl = text.indexOf('\n', start);
		if (nl < 0) return text.length;
		start = nl + 1;
	}
	const nl = text.indexOf('\n', start);
	const lineEnd = nl < 0 ? text.length : nl;
	return Math.min(start + Math.max(0, column), lineEnd);
}
