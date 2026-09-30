// The templates a user saved from their own projects. One folder each under the templates
// directory (<userData>/templates, which a portable copy keeps beside the exe): template.json is
// what the starter picker shows, files/ is the project as it was saved. A template saved as its Git
// remote has no files/: the renderer clones the address each time it is used.
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { copyMissing, copyNew, isInsidePath, nativeRel } from './templateCopy';
import { isTemplateId, uniqueTemplateId } from './templateNaming';
import { isRemoteUrl, withoutSignIn } from '../git/remote/gitRemote';

const MANIFEST = 'template.json';
const FILES_DIR = 'files';
const MAX_NAME = 120;
const MAX_DESCRIPTION = 500;
// a save or a download that died halfway leaves its work folder behind; old enough, nobody owns it
const STALE_WORK_MS = 60 * 60 * 1000;

export type TemplateLang = 'latex' | 'typst';

export type UserTemplate = {
	id: string;
	name: string;
	description: string;
	lang: TemplateLang;
	/** root-relative, forward-slashed: the file the editor opens and sets as main */
	mainFile: string;
	createdAt: number;
	/** the Git address a project made from it is cloned from; absent for a copy of files */
	remote?: string;
};

export type SaveTemplateRequest = {
	root: string;
	/** root-relative paths, as the survey reported them and the renderer chose them */
	files: string[];
	name: string;
	description: string;
	lang: TemplateLang;
	mainFile: string;
	/** overwrite this template instead of adding one (the user chose Replace on a name clash) */
	replaceId?: string;
	/** save this address instead of copying files */
	remote?: string;
};

function cleanText(text: unknown, max: number): string {
	return typeof text === 'string' ? text.trim().slice(0, max) : '';
}

function manifestOf(raw: unknown, id: string): UserTemplate | null {
	if (!raw || typeof raw !== 'object') return null;
	const m = raw as Record<string, unknown>;
	const name = cleanText(m.name, MAX_NAME);
	const lang = m.lang === 'typst' || m.lang === 'latex' ? m.lang : null;
	if (!name || !lang || !isInsidePath(m.mainFile)) return null;
	const remote = typeof m.remote === 'string' && isRemoteUrl(m.remote) ? m.remote.trim() : undefined;
	return {
		id,
		name,
		description: cleanText(m.description, MAX_DESCRIPTION),
		lang,
		mainFile: m.mainFile,
		createdAt: typeof m.createdAt === 'number' ? m.createdAt : 0,
		...(remote ? { remote } : {})
	};
}

async function readManifest(dir: string, id: string): Promise<UserTemplate | null> {
	try {
		return manifestOf(JSON.parse(await readFile(join(dir, id, MANIFEST), 'utf8')), id);
	} catch {
		return null;
	}
}

async function writeManifest(folder: string, t: UserTemplate): Promise<void> {
	// the id is the folder's name, so it is not stored twice
	const stored = { name: t.name, description: t.description, lang: t.lang, mainFile: t.mainFile, createdAt: t.createdAt, remote: t.remote };
	await writeFile(join(folder, MANIFEST), `${JSON.stringify(stored, null, '\t')}\n`, 'utf8');
}

/** drops work folders (".saving-*", ".staging/*") that a crash left behind */
async function sweepStaleWork(dir: string): Promise<void> {
	const now = Date.now();
	async function sweep(parent: string, match: (name: string) => boolean): Promise<void> {
		let names: string[];
		try {
			names = await readdir(parent);
		} catch {
			return;
		}
		for (const name of names.filter(match)) {
			const path = join(parent, name);
			const age = now - (await stat(path).catch(() => ({ mtimeMs: now }))).mtimeMs;
			if (age > STALE_WORK_MS) await rm(path, { recursive: true, force: true }).catch(() => {});
		}
	}
	await sweep(dir, (name) => name.startsWith('.saving-'));
	await sweep(join(dir, '.staging'), () => true);
}

/** every readable template, by name; a folder without a valid template.json is not one */
export async function listUserTemplates(dir: string): Promise<UserTemplate[]> {
	await sweepStaleWork(dir);
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}
	const found = await Promise.all(entries.filter((e) => e.isDirectory() && isTemplateId(e.name)).map((e) => readManifest(dir, e.name)));
	return found.filter((t): t is UserTemplate => !!t).sort((a, b) => a.name.localeCompare(b.name));
}

function checkRequest(req: SaveTemplateRequest): void {
	if (!cleanText(req.name, MAX_NAME)) throw new Error('A template needs a name.');
	if (req.lang !== 'latex' && req.lang !== 'typst') throw new Error('Unknown template format.');
	if (req.replaceId !== undefined && !isTemplateId(req.replaceId)) throw new Error('Unknown template.');
	if (req.remote !== undefined) {
		// the main file is only where a clone should open, if the repository still has it
		if (typeof req.remote !== 'string' || !isRemoteUrl(req.remote)) throw new Error('That Git address cannot be used.');
		if (!isInsidePath(req.mainFile)) throw new Error('The main file lies outside the folder.');
		return;
	}
	if (!Array.isArray(req.files) || !req.files.every(isInsidePath)) throw new Error('A template file lies outside the folder.');
	if (!isInsidePath(req.mainFile) || !req.files.includes(req.mainFile)) throw new Error('The main file is not among the files to save.');
}

/**
 * Copy the chosen files into a new template (or over `replaceId`).
 *
 * Built in a hidden work folder and renamed into place only once complete, so a failure halfway -
 * a file that cannot be read, a full disk - never leaves a half template in the picker. A replace
 * swaps the folders: the old template is only removed once the new one is in its place.
 */
export async function saveUserTemplate(dir: string, req: SaveTemplateRequest): Promise<UserTemplate> {
	checkRequest(req);
	await mkdir(dir, { recursive: true });
	const work = join(dir, `.saving-${randomUUID().slice(0, 8)}`);
	try {
		await mkdir(work);
		// a token in the address stays out of template.json; a private repository asks to sign in instead
		const remote = req.remote === undefined ? undefined : withoutSignIn(req.remote.trim());
		if (!remote) for (const rel of req.files) await copyNew(join(req.root, nativeRel(rel)), join(work, FILES_DIR, nativeRel(rel)));
		const taken = (await readdir(dir)).filter(isTemplateId);
		const id = req.replaceId ?? uniqueTemplateId(req.name, taken);
		const template: UserTemplate = {
			id,
			name: cleanText(req.name, MAX_NAME),
			description: cleanText(req.description, MAX_DESCRIPTION),
			lang: req.lang,
			mainFile: req.mainFile,
			createdAt: Date.now(),
			...(remote ? { remote } : {})
		};
		await writeManifest(work, template);
		if (req.replaceId) await replaceWith(work, join(dir, id));
		else await rename(work, join(dir, id));
		return template;
	} catch (e) {
		await rm(work, { recursive: true, force: true }).catch(() => {});
		throw e;
	}
}

/** rename `work` to `dest`, setting the old `dest` aside first and putting it back on failure */
async function replaceWith(work: string, dest: string): Promise<void> {
	const previous = `${work}-previous`;
	const hadPrevious = await rename(dest, previous).then(
		() => true,
		() => false
	);
	try {
		await rename(work, dest);
	} catch (e) {
		if (hadPrevious) await rename(previous, dest).catch(() => {});
		throw e;
	}
	if (hadPrevious) await rm(previous, { recursive: true, force: true }).catch(() => {});
}

export async function updateUserTemplate(dir: string, id: string, name: string, description: string): Promise<UserTemplate> {
	if (!isTemplateId(id)) throw new Error('Unknown template.');
	const current = await readManifest(dir, id);
	if (!current) throw new Error('That template no longer exists.');
	const next = { ...current, name: cleanText(name, MAX_NAME) || current.name, description: cleanText(description, MAX_DESCRIPTION) };
	await writeManifest(join(dir, id), next);
	return next;
}

export async function deleteUserTemplate(dir: string, id: string): Promise<void> {
	if (!isTemplateId(id)) throw new Error('Unknown template.');
	await rm(join(dir, id), { recursive: true, force: true });
}

/** copy a template into `root`, keeping the user's own files; returns the absolute main file */
export async function applyUserTemplate(dir: string, id: string, root: string): Promise<string> {
	if (!isTemplateId(id)) throw new Error('Unknown template.');
	const template = await readManifest(dir, id);
	if (!template) throw new Error('That template no longer exists.');
	if (template.remote) throw new Error('That template is cloned from its Git address.');
	await copyMissing(join(dir, id, FILES_DIR), root);
	return join(root, nativeRel(template.mainFile));
}
