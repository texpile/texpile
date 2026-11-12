import type * as Y from 'yjs';
import { resolveMergeOnto } from '$lib/diff/comparison/mergeResolve';
import { buildChangesForInts } from '$lib/diff/lcs/diff';
import { FilesTooBigForDiffError } from '$lib/diff/lcs/filesTooBigForDiffError';
import { spliceDiff } from '$lib/collab/spliceDiff';
import { DISK_ORIGIN } from '$lib/collab/sharedFiles';

export type MergeEdit = { from: number; to: number; insert: string };

export type DiskTake = { kind: 'same' } | { kind: 'adopt' } | { kind: 'merge'; edits: MergeEdit[] } | { kind: 'conflict' };

type Hunk = { memoryFrom: number; memoryTo: number; diskFrom: number; diskTo: number };

// where each line starts, and the end of the text
function lineStarts(text: string): number[] {
	const starts = [0];
	for (let at = text.indexOf('\n'); at >= 0; at = text.indexOf('\n', at + 1)) starts.push(at + 1);
	starts.push(text.length);
	return starts;
}

// the stretches of whole lines that differ, by IntelliJ's line comparison; null past its size limit
function changedLines(memory: string, disk: string): Hunk[] | null {
	const ids = new Map<string, number>();
	function numbered(text: string, starts: number[]): Int32Array {
		const out = new Int32Array(starts.length - 1);
		for (let i = 0; i < out.length; i++) {
			const line = text.slice(starts[i], starts[i + 1]);
			let id = ids.get(line);
			if (id === undefined) ids.set(line, (id = ids.size));
			out[i] = id;
		}
		return out;
	}
	const inMemory = lineStarts(memory);
	const onDisk = lineStarts(disk);
	const hunks: Hunk[] = [];
	try {
		for (let c = buildChangesForInts(numbered(memory, inMemory), numbered(disk, onDisk)); c; c = c.link)
			hunks.push({
				memoryFrom: inMemory[c.line0],
				memoryTo: inMemory[c.line0 + c.deleted],
				diskFrom: onDisk[c.line1],
				diskTo: onDisk[c.line1 + c.inserted]
			});
	} catch (error) {
		if (error instanceof FilesTooBigForDiffError) return null;
		throw error;
	}
	return hunks;
}

function oneSplice(memory: string, disk: string, at = 0): MergeEdit[] {
	const change = spliceDiff(memory, disk);
	return change ? [{ from: at + change.index, to: at + change.index + change.remove, insert: change.insert }] : [];
}

/** The disk's text as word edits on the loaded text, so what is anchored to unchanged words stays; one splice past
 *  the diff's size limit. The lines that differ are found first and the words compared inside them, as IntelliJ
 *  does: comparing the words of a whole 140-page file took 200 ms for one changed word */
export function diskEdits(memory: string, disk: string): MergeEdit[] {
	if (memory === disk) return [];
	const hunks = changedLines(memory, disk);
	if (!hunks) return resolveMergeOnto(disk, memory, memory) ?? oneSplice(memory, disk);
	const edits: MergeEdit[] = [];
	for (const h of hunks) {
		const before = memory.slice(h.memoryFrom, h.memoryTo);
		const after = disk.slice(h.diskFrom, h.diskTo);
		const words = resolveMergeOnto(after, before, before);
		if (!words) edits.push(...oneSplice(before, after, h.memoryFrom));
		else for (const e of words) edits.push({ from: h.memoryFrom + e.from, to: h.memoryFrom + e.to, insert: e.insert });
	}
	return edits;
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
