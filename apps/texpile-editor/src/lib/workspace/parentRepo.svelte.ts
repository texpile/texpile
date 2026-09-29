// A repository found above the open folder - a home directory kept in git for its dotfiles, a
// research repo with the paper in one subfolder - is used only once the author says so. VS Code
// asks the same (git.openRepositoryInParentFolders). Without asking, Save version would record the
// paper in whatever repository happened to contain it, and reset that repository's staged work
// along the way. Remembered per folder, on this machine.
import { samePath } from './fileSystem';

const KEY = 'texpile:parentRepo:';

/** this session's answers, so the panel reacts the moment one is given */
let answered = $state<Record<string, string>>({});

function stored(root: string): string | null {
	try {
		return localStorage.getItem(KEY + root);
	} catch {
		return null;
	}
}

/** the repository above `root` that is waiting for the author's word, or null */
export function parentRepoToConfirm(root: string | null, repoRoot: string | null): string | null {
	if (!root || !repoRoot || samePath(root, repoRoot)) return null;
	const ok = answered[root] ?? stored(root);
	return ok && samePath(ok, repoRoot) ? null : repoRoot;
}

export function useParentRepo(root: string, repoRoot: string): void {
	answered = { ...answered, [root]: repoRoot };
	try {
		localStorage.setItem(KEY + root, repoRoot);
	} catch {
		// asked again next time, which is the safe side
	}
}
