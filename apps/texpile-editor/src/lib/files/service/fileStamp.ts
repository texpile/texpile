// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. Ported from vscode src/vs/platform/files/common/files.ts and fileService.ts
import { fileService } from './fileService';
import { fileUriOf } from '../identity/fileUris';
import { ResourceMap } from '../identity/resourceMap';
import { extUri } from '../identity/extUri';

export function etag(stat: { mtime: number; size: number }): string {
	return stat.mtime.toString(29) + stat.size.toString(31);
}

const stamps = new ResourceMap<string>();

/** at every moment the disk is known: a read, a write, an adopted change */
export async function recordFileStamp(path: string): Promise<void> {
	try {
		const st = await fileService.stat(path);
		if (st.exists) stamps.set(fileUriOf(path), etag({ mtime: st.mtimeMs, size: st.size }));
		else stamps.delete(fileUriOf(path));
	} catch {
		stamps.delete(fileUriOf(path));
	}
}

/** the disk holds what this window last read or wrote: a watcher report of its own save */
export async function fileAsStamped(path: string): Promise<boolean> {
	const stamp = stamps.get(fileUriOf(path));
	if (!stamp) return false;
	try {
		const st = await fileService.stat(path);
		return st.exists && etag({ mtime: st.mtimeMs, size: st.size }) === stamp;
	} catch {
		return false;
	}
}

// stricter than vscode, which lets a newer mtime with the same size through: an agent's one-letter fix is that
/** 'gone' when deleted; a file never stamped has not changed; `writing` that already matches the disk passes */
export async function fileModifiedSince(path: string, writing?: string): Promise<boolean | 'gone'> {
	const stamp = stamps.get(fileUriOf(path));
	if (!stamp) return false;
	let st: Awaited<ReturnType<typeof fileService.stat>>;
	try {
		st = await fileService.stat(path);
	} catch {
		return false;
	}
	if (!st.exists) return 'gone';
	if (etag({ mtime: st.mtimeMs, size: st.size }) === stamp) return false;
	return !(writing != null && new TextEncoder().encode(writing).length === st.size && (await sameText(path, writing)));
}

async function sameText(path: string, text: string): Promise<boolean> {
	try {
		return (await fileService.readText(path)) === text;
	} catch {
		return false;
	}
}

/** a rename carries the stamps along, every one below a folder too */
export function retargetFileStamp(from: string, to: string): void {
	const fromUri = fileUriOf(from);
	const toUri = fileUriOf(to);
	for (const [uri, stamp] of [...stamps]) {
		if (!extUri.isEqualOrParent(uri, fromUri)) continue;
		const below = extUri.relativePath(fromUri, uri);
		stamps.delete(uri);
		stamps.set(below ? extUri.joinPath(toUri, below) : toUri, stamp);
	}
}
