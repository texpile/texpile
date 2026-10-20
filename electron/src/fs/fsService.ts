// the primitive workspace file ops (read/write/stat and the create/delete/rename family);
// kept dependency-free (node builtins only). Traversal lives in fsWalk, search in fsSearch.
import { readFile, writeFile, mkdir, rm, rename, stat, cp } from 'node:fs/promises';
import { dirname, basename, extname, sep, resolve } from 'node:path';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { decodeText, type SourceEncoding } from './textDecode';

export const MIME: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.webp': 'image/webp',
	'.bmp': 'image/bmp',
	'.pdf': 'application/pdf'
};

export async function read(path: string): Promise<{ content: string; encoding: SourceEncoding }> {
	if (!path) throw new Error('Missing path');
	return decodeText(await readFile(path));
}

/** writes text, creating parent directories. */
export async function write(path: string, content: string): Promise<{ ok: true }> {
	if (!path || typeof content !== 'string') throw new Error('Missing path or content');
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, content, 'utf-8');
	return { ok: true };
}

/** writes raw bytes, creating parent directories. */
export async function writeBinary(path: string, data: ArrayBuffer | Uint8Array): Promise<{ ok: true }> {
	if (!path || data == null) throw new Error('Missing path or file');
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, data instanceof Uint8Array ? data : Buffer.from(data));
	return { ok: true };
}

/** { exists, mtimeMs, size }, used to poll for a freshly-written compile output. */
export async function statFile(path: string): Promise<{ exists: boolean; mtimeMs: number; size: number; isDirectory: boolean }> {
	if (!path) throw new Error('Missing path');
	try {
		const s = await stat(path);
		return { exists: true, mtimeMs: s.mtimeMs, size: s.size, isDirectory: s.isDirectory() };
	} catch {
		return { exists: false, mtimeMs: 0, size: 0, isDirectory: false };
	}
}

/** no in-app caller; the live-test harness bridge serves workspace files through this (tests/live/server.mjs) */
export async function fileBytes(path: string): Promise<{ data: Buffer; mime: string }> {
	if (!path) throw new Error('Missing path');
	const data = await readFile(path);
	const mime = MIME[extname(path).toLowerCase()] || 'application/octet-stream';
	return { data, mime };
}

export type FsOpBody = {
	action?: string;
	path?: string;
	type?: string;
	content?: string;
	from?: string;
	to?: string;
};

export type FsOpResult = {
	ok: true;
};

// reject names illegal on any target OS (enforced everywhere so projects stay portable): on
// Windows a ':' silently creates an NTFS alternate data stream, trailing dot/space and device names throw
const RESERVED_WIN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;
function validateName(name: string): void {
	if (!name || name === '.' || name === '..') throw new Error('Invalid file name');
	if (name.includes('/') || name.includes('\\')) throw new Error('File name cannot contain a slash');
	// eslint-disable-next-line no-control-regex
	if (/[<>:"|?*\x00-\x1f]/.test(name)) throw new Error('File name cannot contain any of < > : " | ? *');
	if (/[ .]$/.test(name)) throw new Error('File name cannot end with a space or a period');
	if (RESERVED_WIN.test(name)) throw new Error(`"${name}" is a reserved file name`);
}

function sameEntry(a: string, b: string): boolean {
	try {
		if (realpathSync.native(a) === realpathSync.native(b)) return true;
		const sa = statSync(a);
		const sb = statSync(b);
		return sa.ino !== 0 && sa.ino === sb.ino && sa.dev === sb.dev;
	} catch {
		return false;
	}
}

export async function applyFileOp(body: FsOpBody): Promise<FsOpResult> {
	const action = body?.action;
	if (action === 'create') {
		const path = body.path;
		if (!path) throw new Error('Missing path');
		validateName(basename(path));
		if (body.type === 'dir') {
			await mkdir(path, { recursive: true });
		} else {
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, body.content ?? '', { flag: 'wx' }); // wx: fail if exists
		}
	} else if (action === 'delete') {
		const path = body.path;
		if (!path) throw new Error('Missing path');
		await rm(path, { recursive: true, force: true });
	} else if (action === 'restore') {
		const { from, to } = body;
		if (!from || !to) throw new Error('Missing from/to');
		// Never overwrite on the way back. Undo is supposed to be the safe direction, and something
		// standing at the old path means the world moved on - report that rather than clobber it.
		if (existsSync(to)) throw new Error(`Cannot restore: "${basename(to)}" already exists`);
		// the folder that held it may have been deleted since
		await mkdir(dirname(to), { recursive: true });
		// COPY back, not move: the backup has to survive so a redo-then-undo can restore it again,
		// and the whole set is discarded together when the workspace is next opened
		await cp(from, to, { recursive: true, errorOnExist: true });
	} else if (action === 'rename') {
		const { from, to } = body;
		if (!from || !to) throw new Error('Missing from/to');
		validateName(basename(to));
		// a rename never overwrites; only a case change of the same entry may land on an "existing"
		// path (a case-insensitive file system answers exists for it). Replacing is a separate
		// gesture: the file tree asks, then recycles the destination before renaming onto it
		if (existsSync(to) && !sameEntry(from, to)) throw new Error(`"${basename(to)}" already exists`);
		await rename(from, to);
	} else if (action === 'copy') {
		// cross-window drag: files copied from another workspace (recursive for folders).
		// force:false so a raced-in destination is an error instead of a silent overwrite.
		const { from, to } = body;
		if (!from || !to) throw new Error('Missing from/to');
		validateName(basename(to));
		const src = resolve(from);
		const dest = resolve(to);
		if (dest === src || (dest + sep).startsWith(src + sep)) throw new Error('Cannot copy a folder into itself');
		await mkdir(dirname(dest), { recursive: true });
		await cp(src, dest, { recursive: true, force: false, errorOnExist: true });
	} else {
		throw new Error('Unknown action');
	}
	return { ok: true };
}
