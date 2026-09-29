import type { TreeEntry } from '$lib/workspace/fileSystem';
import { gitKey, gitFolderStatus } from '$lib/workspace/scm/gitStore';
import type { GitBadge } from '$lib/workspace/scm/git';
import { m } from '$lib/paraglide/messages';

export function gitBadgeOf(gitStatus: Record<string, GitBadge>, e: TreeEntry): GitBadge | undefined {
	const key = gitKey(e.path);
	const own = e.type === 'file' ? gitStatus[key] : (gitFolderStatus.current[key] ?? gitStatus[key]);
	return own ?? inNewFolder(gitStatus, key);
}

/** A big new folder is one row in Source Control, keyed by the folder (gitStatusLimit.ts), so
 *  nothing inside it has a status of its own: the folder's row speaks for all of it. */
function inNewFolder(gitStatus: Record<string, GitBadge>, key: string): GitBadge | undefined {
	for (let dir = key.slice(0, key.lastIndexOf('/')); dir.includes('/'); dir = dir.slice(0, dir.lastIndexOf('/')))
		if (gitStatus[dir] === 'U') return 'U';
	return undefined;
}

// Status is carried by the file name's colour rather than a letter, so it costs the row no width.
// The tooltip below is what names the state, since a colour alone cannot.
export const STATUS_COLOR: Record<GitBadge, string> = {
	M: 'text-git-modified',
	// added and untracked are both "new" and share one green, the way VS Code reads them
	A: 'text-git-added',
	U: 'text-git-added',
	D: 'text-git-deleted',
	R: 'text-git-renamed',
	// both sides changed it and it holds conflict markers: the error colour, since it needs someone
	C: 'text-error-ink'
};

export const STATUS_TITLE: Record<GitBadge, string> = {
	M: m.filetree_badge_modified(),
	A: m.filetree_badge_added(),
	D: m.filetree_badge_deleted(),
	U: m.filetree_badge_untracked(),
	R: m.filetree_badge_renamed(),
	C: m.filetree_badge_conflict()
};

/** What the colour says, for someone who cannot see it: a deleted file is struck through, and a
 *  file still being combined carries a '!' (FileTreeRow, ChangeRows). */
export const STATUS_DECOR: Partial<Record<GitBadge, string>> = { D: 'line-through' };

/** a folder's own tooltip: its colour is the weightiest change inside it */
export function folderTitle(badge: GitBadge): string {
	return badge === 'C' ? m.filetree_folder_conflict() : m.filetree_folder_changed();
}
