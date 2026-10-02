// The project's text files as a turn started, so its end can say which files the agent changed and what
// each held before. Read from disk rather than taken from the agent's reports: a report shows a hunk, not
// the whole file, and a file changed by a command the agent ran is never reported at all
import { readdir, readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';

const TEXT_EXTENSIONS = new Set(
	'tex ltx sty cls dtx ins bib bst bbx cbx typ md markdown txt csv tsv json yaml yml toml lua py r jl m sh'.split(' ').map((e) => `.${e}`)
);
const SKIPPED_FOLDERS = new Set(['.git', 'node_modules', '.texpile']);
const MOST_FILE_BYTES = 1024 * 1024;
// entries looked at, not text files found: a single file opened from the home folder makes it the root
const MOST_ENTRIES = 20000;
const MOST_TOTAL_BYTES = 40 * 1024 * 1024;

/** a file's size and time say whether a later snapshot can keep its text without reading it again */
type SnapshotFile = { size: number; mtimeMs: number; text: string };

export type TurnSnapshot = {
	/** workspace-relative path, with forward slashes */
	files: Map<string, SnapshotFile>;
	/** every text file listed, the ones too large to read included */
	found: Set<string>;
	/** false when the listing stopped early, so a file it did not reach may still be there */
	complete: boolean;
};

export type TurnChange = { path: string; kind: 'modified' | 'added' | 'deleted'; before: string | null };

async function listTextFiles(root: string): Promise<{ files: string[]; complete: boolean }> {
	const files: string[] = [];
	let entries = 0;
	async function walk(dir: string): Promise<void> {
		let list;
		try {
			list = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const e of list) {
			if (++entries > MOST_ENTRIES) return;
			const full = path.join(dir, e.name);
			if (e.isDirectory() && !SKIPPED_FOLDERS.has(e.name)) await walk(full);
			else if (e.isFile() && TEXT_EXTENSIONS.has(path.extname(e.name).toLowerCase())) files.push(full);
		}
	}
	await walk(root);
	return { files, complete: entries <= MOST_ENTRIES };
}

/** `earlier` lends the text of every file unchanged since, and keeps each file it holds in this one whatever the budget */
export async function takeSnapshot(root: string, earlier?: TurnSnapshot): Promise<TurnSnapshot> {
	const { files, complete } = await listTextFiles(root);
	const snapshot: TurnSnapshot = { files: new Map(), found: new Set(), complete };
	let total = 0;
	for (const full of files) {
		const rel = path.relative(root, full).split(path.sep).join('/');
		snapshot.found.add(rel);
		try {
			const { size, mtimeMs } = await stat(full);
			const known = earlier?.files.get(rel);
			if (size > MOST_FILE_BYTES || (!known && total + size > MOST_TOTAL_BYTES)) continue;
			total += size;
			const text = known && known.size === size && known.mtimeMs === mtimeMs ? known.text : await readFile(full, 'utf8');
			snapshot.files.set(rel, { size, mtimeMs, text });
		} catch {
			// gone between the listing and the read: not part of the project as the snapshot saw it
		}
	}
	return snapshot;
}

/** what Texpile itself wrote during the turn is where the turn starts from, so it is never the agent's change */
export function startFrom(snapshot: TurnSnapshot, rel: string, text: string): void {
	snapshot.files.set(rel, { size: -1, mtimeMs: -1, text });
	snapshot.found.add(rel);
}

export function changesBetween(before: TurnSnapshot, after: TurnSnapshot): TurnChange[] {
	const changes: TurnChange[] = [];
	for (const p of after.found) {
		const was = before.files.get(p);
		// one listed but too large to read before has no text to go back to, and one the listing did not reach may not be new
		if (!was) {
			if (!before.found.has(p) && before.complete) changes.push({ path: p, kind: 'added', before: null });
			continue;
		}
		const now = after.files.get(p);
		// still there but now too large to read: it changed
		if (!now || now.text !== was.text) changes.push({ path: p, kind: 'modified', before: was.text });
	}
	for (const [p, was] of before.files)
		if (!after.found.has(p) && after.complete) changes.push({ path: p, kind: 'deleted', before: was.text });
	return changes.sort((a, b) => a.path.localeCompare(b.path));
}
