// where a root-relative path really lands, whatever spelling named it (8.3 short names, case)
import { lstat, realpath } from 'node:fs/promises';
import * as path from 'node:path';

// what Win32 makes of a name it creates; '' for a stream name ("dir::$INDEX_ALLOCATION" is dir itself)
function createdName(name: string): string {
	if (process.platform !== 'win32') return name;
	return name.includes(':') ? '' : name.replace(/[. ]+$/, '');
}

async function isEntry(p: string): Promise<boolean> {
	try {
		await lstat(p);
		return true;
	} catch {
		return false;
	}
}

/** rel as it really lands under root, null outside it; a path not there yet goes through its nearest existing ancestor */
export async function resolveRealRelative(root: string, rel: string): Promise<string | null> {
	const realRoot = await realpath(root);
	const tail: string[] = [];
	let probe = path.resolve(root, rel);
	let real: string;
	for (;;) {
		try {
			// the promise realpath is libuv's, which returns long names; the callback one keeps the spelling
			real = await realpath(probe);
			break;
		} catch (e) {
			const code = (e as NodeJS.ErrnoException).code;
			if (code !== 'ENOENT' && code !== 'ENOTDIR') return null;
			// a dangling link: writing through it would land wherever it points
			if (await isEntry(probe)) return null;
			const parent = path.dirname(probe);
			const name = createdName(path.basename(probe));
			if (parent === probe || !name) return null;
			tail.unshift(name);
			probe = parent;
		}
	}
	const inside = path.relative(realRoot, path.join(real, ...tail));
	if (!inside || inside === '..' || inside.startsWith('..' + path.sep) || path.isAbsolute(inside)) return null;
	return inside.split(path.sep).join('/');
}
