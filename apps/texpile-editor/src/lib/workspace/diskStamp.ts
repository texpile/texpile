// Cheap external-write detection: an mtime+size stamp per path, recorded at every moment we KNOW
// what is on disk (just read it, just wrote it, just adopted it). Before an autosave overwrites,
// the pipeline compares the current stat against the stamp - a mismatch means someone else wrote
// the file since we last looked, and blindly writing would destroy their change.
//
// Stat, not content: re-reading a 2 MB paper on every 1.5 s autosave to compare bytes is the
// alternative, and it buys nothing (mtime+size only misses a same-length same-mtime rewrite, which
// is not a thing real editors or agents produce).
import { statFile } from './fileSystem';

const stamps = new Map<string, { mtimeMs: number; size: number }>();

/** call at every point disk content is knowingly synchronized: file load, successful write,
 * conflict-reload adoption */
export async function recordDiskStamp(path: string): Promise<void> {
	try {
		const st = await statFile(path);
		if (st.exists) stamps.set(path, { mtimeMs: st.mtimeMs, size: st.size });
		else stamps.delete(path);
	} catch {
		stamps.delete(path); // unknown beats stale: a missing stamp disables the guard, never trips it
	}
}

/** the file differs from its stamp, or 'gone' when it was deleted; with no stamp (a new file) nothing has changed */
export async function diskChangedSince(path: string): Promise<boolean | 'gone'> {
	const stamp = stamps.get(path);
	if (!stamp) return false;
	try {
		const st = await statFile(path);
		if (!st.exists) return 'gone';
		return st.mtimeMs !== stamp.mtimeMs || st.size !== stamp.size;
	} catch {
		return false;
	}
}

/** a rename carries the stamp along */
export function retargetDiskStamp(from: string, to: string): void {
	const s = stamps.get(from);
	stamps.delete(from);
	if (s) stamps.set(to, s);
}

export function forgetDiskStamp(path: string): void {
	stamps.delete(path);
}
