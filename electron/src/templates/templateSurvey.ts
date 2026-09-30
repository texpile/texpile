// What "Save as template" would copy out of a project: every file, with its size, minus the folders
// the scan and search already treat as noise (dot folders such as .git and .texpile, node_modules,
// Draft mode's _draft, and build output). Which of these files are compile scratch is the
// renderer's call, from the same list the collab share filter uses.
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { SCAN_IGNORE_DIRS, skipDir } from '../fs/walkIgnoreRules';

const MAX_DEPTH = 16;

export type SurveyedFile = {
	/** root-relative, forward-slashed */
	path: string;
	size: number;
};

export type ProjectSurvey = {
	files: SurveyedFile[];
	/** the walk stopped at the file limit; there is more than `files` */
	truncated: boolean;
	/** that limit, for the message saying so */
	limit: number;
};

class SurveyWalk {
	readonly files: SurveyedFile[] = [];
	truncated = false;

	constructor(private readonly maxFiles: number) {}

	async walk(dir: string, rel: string, depth: number): Promise<void> {
		if (depth > MAX_DEPTH || this.truncated) return;
		let entries;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const e of entries) {
			if (this.truncated) return;
			const childRel = rel ? `${rel}/${e.name}` : e.name;
			// symbolic links are not followed: a link to a parent folder would never end, and one to a
			// library elsewhere on disk is not part of the project
			if (e.isDirectory()) {
				if (!skipDir(e.name, SCAN_IGNORE_DIRS)) await this.walk(join(dir, e.name), childRel, depth + 1);
			} else if (e.isFile()) {
				await this.add(join(dir, e.name), childRel);
			}
		}
	}

	private async add(abs: string, rel: string): Promise<void> {
		if (this.files.length >= this.maxFiles) {
			this.truncated = true;
			return;
		}
		try {
			this.files.push({ path: rel, size: (await stat(abs)).size });
		} catch {
			/* vanished mid-walk */
		}
	}
}

/** the project's files, stopping once there are more than `maxFiles` of them */
export async function surveyProject(root: string, maxFiles: number): Promise<ProjectSurvey> {
	const walk = new SurveyWalk(maxFiles);
	await walk.walk(root, '', 0);
	return { files: walk.files, truncated: walk.truncated, limit: maxFiles };
}
