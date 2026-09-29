// The open file as it was in the last saved version, for the change bars in the source editor's
// margin (lib/editor/source/cmChangeMarkers.ts). Read when the file opens and again whenever HEAD
// moves - a version saved here or in a terminal, a sync, a switch of branch.
import { gitShowHead } from './scm/git';
import { isGitRepo, gitHeldBack, gitChanges, isConflicted } from './scm/gitStore';
import { samePath, toLf } from './fileSystem';

export class ChangeBaseline {
	/** null: no markers, which is right for a file with no saved version (every line would be new) */
	text = $state<string | null>(null);
	private seq = 0;
	/** the file `text` belongs to */
	private path: string | null = null;

	async load(path: string | null): Promise<void> {
		const mine = ++this.seq;
		// another file: the one before's version must not be what its bars are drawn against while git
		// is asked. The same file again (HEAD moved) keeps its bars until the new version is in
		if (this.path === null || path === null || !samePath(this.path, path)) this.text = null;
		this.path = path;
		// a file being combined has no marks, as VS Code's quick diff leaves one alone: its conflict
		// colours already say what differs, and bars against the last version would only double them
		const combining = !!path && gitChanges.current.some((c) => isConflicted(c.x, c.y) && samePath(c.path, path));
		if (!path || !isGitRepo.current || gitHeldBack.current || combining) {
			this.text = null;
			return;
		}
		const res = await gitShowHead(path);
		if (mine !== this.seq) return; // another file, or a newer HEAD, got there first
		this.text = res.ok && res.hasHead ? toLf(res.content ?? '') : null;
	}
}
