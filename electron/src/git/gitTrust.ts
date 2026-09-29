// Trusting a repository git will not work in because the folder belongs to another account on this
// computer: a USB or network drive, or a project copied from another user. git refuses such a
// folder until it is listed in safe.directory, since a repository's own settings can run programs;
// without this Texpile called it "not a repository" and offered an Initialize that did nothing.
// VS Code's Manage Unsafe Repositories, reduced to the one folder open.
import { simpleGit } from 'simple-git';
import { homedir } from 'node:os';
import { errMsg, git, gitRecheck, isMissingGit, type GitOpResult } from './gitService';
import { unsafeRepoFrom } from './unsafeRepo';

export type GitTrustResult = GitOpResult & { path?: string };

/** Add the folder git refused to the global safe.directory list. The path is asked of git again
 *  rather than taken from the window, so only the repository git itself named can be trusted. */
export async function gitTrustRepo(workspaceRoot: string): Promise<GitTrustResult> {
	try {
		let refusal: string | null = null;
		try {
			await git(workspaceRoot).raw(['rev-parse', '--show-toplevel']);
		} catch (e) {
			if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
			refusal = errMsg(e);
		}
		// nothing refused: already trusted, perhaps from a terminal
		if (refusal === null) return { ok: true };
		const path = unsafeRepoFrom(refusal);
		if (!path) return { ok: false, error: refusal };
		// from the home folder: the global config is not the refused repository's to answer for
		await simpleGit({ baseDir: homedir(), binary: 'git' }).raw(['config', '--global', '--add', 'safe.directory', path]);
		await gitRecheck(); // the refusal was remembered as "no repository here"
		return { ok: true, path };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		return { ok: false, error: errMsg(e) };
	}
}
