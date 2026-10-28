// what the buffers read and write the disk with, and what the workspace does around each write
export type TextBuffersFs = {
	/** raw bytes: both the text/binary classification and the seeded body come from one read */
	readBytes(absPath: string): Promise<Uint8Array>;
	writeText(absPath: string, content: string): Promise<unknown>;
	/** flat file list, root-relative forward-slash paths. mtimeMs is only meaningful for binaries;
	 *  it becomes the manifest rev a guest uses to notice its cached copy went stale. */
	listFiles(root: string): Promise<{ rel: string; size: number; mtimeMs?: number }[]>;
};

/** what the workspace does around a write; every one optional, so a test needs none */
export type WriteHooks = {
	/** someone else wrote the file since this side last read or wrote it; 'gone' when it was there and is not */
	diskChanged?(absPath: string): Promise<boolean | 'gone'>;
	/** the file is known as of now: just read, written or taken in */
	recordStamp?(absPath: string): Promise<void>;
	/** the save check: the content to write instead, or null to keep it */
	verify?(absPath: string, content: string): Promise<string | null>;
	/** awaited before the text goes to disk, so what the write records lands first */
	beforeWrite?(absPath: string, content: string): Promise<void>;
	afterWrite?(absPath: string, content: string): void;
	/** the disk's change went into the text, whole or merged with unsaved edits; `disk` is the new common text */
	diskTaken?(absPath: string, disk: string): void;
	/** the disk and the editor changed the same words; the file's writes wait for resolveConflict */
	conflict?(absPath: string, disk: string, memory: string): void;
	/** the file is gone from disk */
	deleted?(absPath: string): void;
	/** a file in conflict needs no choice any more: written, reverted, renamed or dropped */
	resolved?(absPath: string): void;
	failed?(absPath: string, err: unknown): void;
};
