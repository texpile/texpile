// where an opened folder sits in its repository; every path between the window and git goes through here
import { realpath } from 'node:fs';
import { promisify } from 'node:util';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

// not fs.promises.realpath, the native one: it turns a mapped drive into its UNC path
const realpathOf = promisify(realpath);

/** A relative path that leaves the folder it was taken from: above it ('..', '../x'), or on another
 *  drive. A file whose name starts with two dots, '..notes.tex', is inside. */
export function isOutside(rel: string): boolean {
	return rel === '..' || rel.startsWith('../') || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

/** `abs` from `base`, '' for base itself, or null when it is not inside */
function inside(base: string, abs: string): string | null {
	const rel = relative(base, abs);
	return isOutside(rel) ? null : rel;
}

export class RepoPaths {
	constructor(
		/** as the window shows it, and where git runs */
		readonly root: string,
		readonly realRoot: string,
		/** as it was opened */
		readonly folder: string,
		readonly realFolder: string,
		/** the folder from the root as git spells it: '' or 'drafts/v3/' */
		readonly prefix: string
	) {}

	/** the opened folder as a pathspec, '' at the root */
	get scope(): string {
		return this.prefix.replace(/\/$/, '');
	}

	/** absolute paths as repo-relative, forward-slashed ones */
	toGit(paths: string[]): string[] {
		return paths.map((p) => {
			const abs = resolve(p);
			const inFolder = inside(this.folder, abs) ?? inside(this.realFolder, abs);
			if (inFolder !== null) return (this.prefix + inFolder.split(sep).join('/')).replace(/\/$/, '');
			return (inside(this.root, abs) ?? inside(this.realRoot, abs) ?? relative(this.root, abs)).split(sep).join('/');
		});
	}

	/** a repo-relative path git printed, spelled under the folder as it was opened when it is in it */
	fromGit(rel: string): string {
		const inFolder = this.inFolder(rel);
		return inFolder === null ? resolve(this.root, rel) : join(this.folder, inFolder);
	}

	/** whether git's repo-relative path is in the opened folder, the folder itself not counted */
	holds(rel: string): boolean {
		return !!this.inFolder(rel);
	}

	private inFolder(rel: string): string | null {
		return inside(resolve(this.realRoot, this.prefix), resolve(this.realRoot, rel));
	}
}

/** where `folder` sits, from git's --show-prefix for it */
export async function locateRepo(folder: string, prefix: string): Promise<RepoPaths> {
	const up = prefix
		.split('/')
		.filter(Boolean)
		.map(() => '..');
	const realFolder = await realpathOf(folder).catch(() => folder);
	const realRoot = resolve(realFolder, ...up);
	const root = resolve(folder, ...up);
	// a link inside the repository (thesis/current -> drafts/v3): walking up from it overshoots
	const walksUpToRoot = (await realpathOf(root).catch(() => null)) === realRoot;
	return new RepoPaths(walksUpToRoot ? root : realRoot, realRoot, folder, realFolder, prefix);
}
