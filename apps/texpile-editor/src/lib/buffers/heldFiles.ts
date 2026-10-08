// for the flows that rewrite files on disk (Discard Changes, Local History restore): the files an editor other than
// the focused one holds, which need the same care as the focused one's
export type HeldFileDeps = {
	/** files another editor than the focused one holds at or under these paths */
	heldUnder?(paths: string[]): string[];
	/** such a file's edits that are not on disk, taken out of it */
	takeHeldEdit?(path: string): { path: string; content: string } | null;
	/** the files no editor holds edits in take what is on disk now */
	catchUpWithDisk?(): Promise<void>;
};
