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
	/** autosave stands down for this file: deleted from outside, or a conflict put off */
	heldOff?(absPath: string): boolean;
	/** a write found the file changed underneath it; `deliberate` = Ctrl+S */
	conflict?(absPath: string, deliberate: boolean): void;
	saved?(absPath: string): void;
	failed?(absPath: string, err: unknown): void;
};
