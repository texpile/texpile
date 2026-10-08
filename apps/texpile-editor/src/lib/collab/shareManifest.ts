// The share manifest's file walk: every path under the root, with an mtime rev only for the
// files served as blobs (text bodies live in the CRDT and carry their own edits).
import { joinPath, relativeTo, statFile, type TreeEntry } from '$lib/workspace/fileSystem';
import { isLikelyTextName, isShared } from './sharedFiles';

export async function flattenShareManifest(
	children: TreeEntry[],
	root: string
): Promise<{ rel: string; size: number; mtimeMs?: number }[]> {
	const out: { rel: string; size: number }[] = [];
	function walk(entries: TreeEntry[]) {
		for (const e of entries) {
			if (e.type === 'dir') walk(e.children ?? []);
			else out.push({ rel: relativeTo(root, e.path).replace(/\\/g, '/'), size: 0 });
		}
	}
	walk(children);
	// stat only the files served as blobs. Text bodies live in the CRDT and carry their own edits,
	// so they need no rev, and statting every file would make each tree refresh O(n) IPC round-trips.
	// The name is only a fast-path HINT here: a hinted file that sniffs binary anyway just costs a
	// rev of 0, while an unhinted one that sniffs text carries a rev nothing reads.
	return Promise.all(
		out.map(async (f) =>
			isLikelyTextName(f.rel) || !isShared(f.rel) ? f : { ...f, mtimeMs: (await statFile(joinPath(root, f.rel))).mtimeMs }
		)
	);
}
