// Moving a template's files in and out of a project folder, without ever overwriting a file.
import { constants } from 'node:fs';
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, sep } from 'node:path';

/**
 * A root-relative path the renderer named, checked before anything is read or written through it:
 * relative, and never climbing out of the folder it is joined to.
 */
export function isInsidePath(rel: unknown): rel is string {
	if (typeof rel !== 'string' || !rel || rel.includes('\0') || isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) return false;
	const parts = normalize(rel).split(/[\\/]/);
	return !parts.includes('..');
}

/** copy one file, creating its folders; false when the destination already exists */
export async function copyNew(from: string, to: string): Promise<boolean> {
	await mkdir(dirname(to), { recursive: true });
	try {
		// EXCL, not a stat first: the check and the write are one step, so a file that appears in
		// between is still never replaced
		await copyFile(from, to, constants.COPYFILE_EXCL);
		return true;
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false;
		throw e;
	}
}

/**
 * Copy every file under `from` into the same place under `to`, keeping any file already there.
 *
 * The folder a template lands in is the user's: it may already hold a references.bib or a figure,
 * and those win. Symbolic links are skipped rather than followed, so a link can never pull in
 * something from outside the template, and so is any `.git`.
 */
export async function copyMissing(from: string, to: string): Promise<void> {
	const entries = await readdir(from, { withFileTypes: true });
	for (const e of entries) {
		// a clone's history stays behind: the folder becomes the author's project, not the template's repository
		if (e.name === '.git') continue;
		const src = join(from, e.name);
		const dest = join(to, e.name);
		if (e.isDirectory()) await copyMissing(src, dest);
		else if (e.isFile()) await copyNew(src, dest);
	}
}

/** a root-relative path in the platform's own separators */
export function nativeRel(rel: string): string {
	return rel.split(/[\\/]/).join(sep);
}
