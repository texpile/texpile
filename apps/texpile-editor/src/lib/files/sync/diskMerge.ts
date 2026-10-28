import { resolveMergeOnto } from '$lib/diff/comparison/mergeResolve';

export type MergeEdit = { from: number; to: number; insert: string };

export type DiskTake = { kind: 'same' } | { kind: 'adopt' } | { kind: 'merge'; edits: MergeEdit[] } | { kind: 'conflict' };

/** what a disk change does to a loaded file; `common` is the last text the disk and the editor agreed on */
export function takeDiskChange(disk: string, common: string | null, memory: string, unsaved: boolean): DiskTake {
	if (disk === common) return { kind: 'same' };
	if (!unsaved || memory === disk) return { kind: 'adopt' };
	if (common === null) return { kind: 'conflict' };
	const edits = resolveMergeOnto(disk, common, memory);
	return edits ? { kind: 'merge', edits } : { kind: 'conflict' };
}
