// A folder of new files nobody means to save as versions (a data dump, a venv, node_modules, a TeX
// tree) used to put every file in it on its own row, rebuilt on each refresh: slow, and the real
// changes were lost under them. Such a folder becomes one row that says how many files it holds,
// and past a hard cap the list stops, which the panel says. VS Code's git.statusLimit, as rows a
// writer can act on (Add to .gitignore) rather than a setting.
import { sep } from 'node:path';

/** a folder with at least this many new files is shown as one row */
export const FOLDER_ROW_AT = 200;
/** rows past this are left out of the list, and the panel says how many there were */
export const MAX_ROWS = 2000;

type Entry = { path: string; x: string; y: string; files?: number };

/**
 * Replace the files inside each big untracked folder with one row for the folder. `folders` are
 * absolute paths of folders git reports as wholly untracked (`ls-files --others --directory`), so
 * nothing in them is a tracked file with changes. Order is kept: the folder takes its first file's place.
 */
export function collapseUntracked<T extends Entry>(entries: T[], folders: string[], min = FOLDER_ROW_AT): (T | Entry)[] {
	const big = folders
		.map((f) => (f.endsWith(sep) || f.endsWith('/') ? f : f + sep))
		.map((prefix) => ({ prefix, count: entries.filter((e) => e.x === '?' && e.path.startsWith(prefix)).length }))
		.filter((f) => f.count >= min);
	if (!big.length) return entries;
	const out: (T | Entry)[] = [];
	const placed = new Set<string>();
	for (const e of entries) {
		const folder = e.x === '?' ? big.find((f) => e.path.startsWith(f.prefix)) : undefined;
		if (!folder) {
			out.push(e);
			continue;
		}
		if (placed.has(folder.prefix)) continue;
		placed.add(folder.prefix);
		out.push({ path: folder.prefix.slice(0, -1), x: '?', y: '?', files: folder.count });
	}
	return out;
}

/**
 * The list cut at MAX_ROWS, and how many rows there were when it was cut. Rows `keep` picks (the
 * conflicts of a merge) always stay: the panel counts them to know whether the merge can be
 * finished, and each is something the writer must resolve. The rest fill what room is left, in order.
 */
export function capRows<T>(rows: T[], keep: (row: T) => boolean = () => false, max = MAX_ROWS): { rows: T[]; truncated?: number } {
	if (rows.length <= max) return { rows };
	let room = max - rows.filter(keep).length;
	const kept = rows.filter((r) => {
		if (keep(r)) return true;
		room -= 1;
		return room >= 0;
	});
	return { rows: kept, truncated: rows.length };
}
