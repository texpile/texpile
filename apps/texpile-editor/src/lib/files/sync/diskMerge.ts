import type * as Y from 'yjs';
import { resolveMergeOnto } from '$lib/diff/comparison/mergeResolve';
import { spliceDiff } from '$lib/collab/spliceDiff';
import { DISK_ORIGIN } from '$lib/collab/sharedFiles';

export type MergeEdit = { from: number; to: number; insert: string };

export type DiskTake = { kind: 'same' } | { kind: 'adopt' } | { kind: 'merge'; edits: MergeEdit[] } | { kind: 'conflict' };

/** the disk's text as word edits on the loaded text, so what is anchored to unchanged words stays; one splice past the diff's size limit */
export function diskEdits(memory: string, disk: string): MergeEdit[] {
	const words = resolveMergeOnto(disk, memory, memory);
	if (words) return words;
	const change = spliceDiff(memory, disk);
	return change ? [{ from: change.index, to: change.index + change.remove, insert: change.insert }] : [];
}

export function takeDiskEdits(t: Y.Text, edits: MergeEdit[]): void {
	t.doc!.transact(() => {
		for (const e of [...edits].reverse()) {
			if (e.to > e.from) t.delete(e.from, e.to - e.from);
			if (e.insert) t.insert(e.from, e.insert);
		}
	}, DISK_ORIGIN);
}

/** what a disk change does to a loaded file; `common` is the last text the disk and the editor agreed on */
export function takeDiskChange(disk: string, common: string | null, memory: string, unsaved: boolean): DiskTake {
	if (disk === common) return { kind: 'same' };
	if (!unsaved || memory === disk) return { kind: 'adopt' };
	if (common === null) return { kind: 'conflict' };
	const edits = resolveMergeOnto(disk, common, memory);
	return edits ? { kind: 'merge', edits } : { kind: 'conflict' };
}
