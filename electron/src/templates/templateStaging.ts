// Where a Typst Universe template is unpacked before it joins the project.
//
// tinymist's init refuses a folder that is not empty, and a project folder rarely is: .git,
// .texpile or a file the user dropped in first all count. So tinymist writes into an empty folder
// of ours, and the result is copied across the way a saved template is, keeping the user's files.
import { mkdir, rm } from 'node:fs/promises';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { copyMissing } from './templateCopy';

function stagingRoot(templatesDir: string): string {
	return join(templatesDir, '.staging');
}

/** a folder the renderer handed back, accepted only if it is one of ours */
export function ownStagedDir(templatesDir: string, dir: unknown): string {
	if (typeof dir !== 'string') throw new Error('Unknown staging folder.');
	const inside = relative(stagingRoot(templatesDir), resolve(dir));
	if (!inside || inside.startsWith('..') || isAbsolute(inside) || /[\\/]/.test(inside)) throw new Error('Unknown staging folder.');
	return resolve(dir);
}

/** a fresh, empty folder for tinymist to unpack into */
export async function createStagedDir(templatesDir: string): Promise<string> {
	const dir = join(stagingRoot(templatesDir), randomUUID());
	await mkdir(dir, { recursive: true });
	return dir;
}

/** copy what tinymist unpacked into `root` (never overwriting), then drop the staging folder */
export async function adoptStagedDir(templatesDir: string, dir: unknown, root: string): Promise<void> {
	const staged = ownStagedDir(templatesDir, dir);
	try {
		await copyMissing(staged, root);
	} finally {
		await rm(staged, { recursive: true, force: true }).catch(() => {});
	}
}

export async function discardStagedDir(templatesDir: string, dir: unknown): Promise<void> {
	await rm(ownStagedDir(templatesDir, dir), { recursive: true, force: true });
}
