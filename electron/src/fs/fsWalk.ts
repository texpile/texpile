// workspace traversal: the file tree, the flat tex/typ file list, and the combined single walk
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { TREE_IGNORE_DIRS, SCAN_IGNORE_DIRS, skipDir } from './walkIgnoreRules';
import { collator } from './nameCollator';
import { byScanOrder } from './scanOrder';

export type TexFile = {
	name: string;
	path: string;
	relPath: string;
};

export type TreeNode = {
	name: string;
	path: string;
	type: 'dir' | 'file';
	children?: TreeNode[];
};

// 'typ' rides along with 'tex' so a Typst project gets a main file detected and offered in the
// main-file picker; the LaTeX-only consumers of this list (label/citation intel, reference
// rewriting) simply find nothing in a .typ.
function parseExts(extsCsv?: string): string[] {
	return (extsCsv || 'tex,typ')
		.split(',')
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
}

async function scanWalk(dir: string, root: string, acc: TexFile[], depth: number, exts: string[]): Promise<void> {
	if (depth > 12) return;
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	const subdirs: string[] = [];
	for (const e of entries) {
		if (e.isDirectory()) {
			if (skipDir(e.name, SCAN_IGNORE_DIRS)) continue;
			subdirs.push(e.name);
		} else if (exts.some((ext) => e.name.toLowerCase().endsWith('.' + ext))) {
			const full = join(dir, e.name);
			acc.push({ name: e.name, path: full, relPath: full.slice(root.length).replace(/^[\\/]/, '') });
		}
	}
	// siblings in parallel; scan() sorts at the end, so interleaved pushes don't matter
	await Promise.all(subdirs.map((n) => scanWalk(join(dir, n), root, acc, depth + 1, exts)));
}

/** recursively scans `root` for files with the given extensions (default: tex). */
export async function scan(root: string, extsCsv?: string): Promise<{ root: string; files: TexFile[] }> {
	if (!root) throw new Error('Missing path');
	const exts = parseExts(extsCsv);
	const files: TexFile[] = [];
	await scanWalk(root, root, files, 0, exts);
	files.sort(byScanOrder);
	return { root, files };
}

async function treeBuild(dir: string, depth: number): Promise<TreeNode[]> {
	if (depth > 16) return [];
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}
	const subdirs: string[] = [];
	const files: TreeNode[] = [];
	for (const e of entries) {
		if (e.isDirectory()) {
			if (skipDir(e.name, TREE_IGNORE_DIRS)) continue;
			subdirs.push(e.name);
		} else {
			files.push({ name: e.name, path: join(dir, e.name), type: 'file' });
		}
	}
	// sibling dirs recurse in parallel (bounded naturally by the per-level fan-out)
	const dirs = await Promise.all(
		subdirs.map(async (name): Promise<TreeNode> => {
			const full = join(dir, name);
			return { name, path: full, type: 'dir', children: await treeBuild(full, depth + 1) };
		})
	);
	dirs.sort((a, b) => collator.compare(a.name, b.name));
	files.sort((a, b) => collator.compare(a.name, b.name));
	return [...dirs, ...files];
}

export async function tree(root: string): Promise<{ root: string; children: TreeNode[] }> {
	if (!root) throw new Error('Missing path');
	const children = await treeBuild(root, 0);
	return { root, children };
}

// tree + scan in ONE traversal, for the workspace-open path that used to walk the folder
// twice. The tree part keeps the permissive rules, the flat list keeps scan's aggressive
// rules and depth cap (a dir the tree shows but scan ignores contributes nodes, not files),
// so the result matches calling tree() and scan() separately.
async function treeScanWalk(
	dir: string,
	root: string,
	depth: number,
	exts: string[],
	acc: TexFile[],
	scanSkipped: boolean
): Promise<TreeNode[]> {
	if (depth > 16) return [];
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}
	const collect = !scanSkipped && depth <= 12; // scanWalk stops at depth 12
	const subdirs: { name: string; skip: boolean }[] = [];
	const files: TreeNode[] = [];
	for (const e of entries) {
		const full = join(dir, e.name);
		if (e.isDirectory()) {
			if (skipDir(e.name, TREE_IGNORE_DIRS)) continue;
			subdirs.push({ name: e.name, skip: scanSkipped || skipDir(e.name, SCAN_IGNORE_DIRS) });
		} else {
			files.push({ name: e.name, path: full, type: 'file' });
			if (collect && exts.some((ext) => e.name.toLowerCase().endsWith('.' + ext))) {
				acc.push({ name: e.name, path: full, relPath: full.slice(root.length).replace(/^[\\/]/, '') });
			}
		}
	}
	const dirs = await Promise.all(
		subdirs.map(async ({ name, skip }): Promise<TreeNode> => {
			const full = join(dir, name);
			return { name, path: full, type: 'dir', children: await treeScanWalk(full, root, depth + 1, exts, acc, skip) };
		})
	);
	dirs.sort((a, b) => collator.compare(a.name, b.name));
	files.sort((a, b) => collator.compare(a.name, b.name));
	return [...dirs, ...files];
}

/** tree() + scan() from a single walk -> { root, children, files }. */
export async function treeScan(root: string, extsCsv?: string): Promise<{ root: string; children: TreeNode[]; files: TexFile[] }> {
	if (!root) throw new Error('Missing path');
	const exts = parseExts(extsCsv);
	const files: TexFile[] = [];
	const children = await treeScanWalk(root, root, 0, exts, files, false);
	files.sort(byScanOrder);
	return { root, children, files };
}
