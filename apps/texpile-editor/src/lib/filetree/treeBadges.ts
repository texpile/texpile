import type { TreeEntry } from '$lib/workspace/fileSystem';
import { gitKey } from '$lib/workspace/gitStore';
import type { GitBadge } from '$lib/workspace/git';
import { m } from '$lib/paraglide/messages';

export function gitBadgeOf(gitStatus: Record<string, GitBadge>, e: TreeEntry): GitBadge | undefined {
	return e.type === 'file' ? gitStatus[gitKey(e.path)] : undefined;
}

// Status is carried by the file name's colour rather than a letter, so it costs the row no width.
// The tooltip below is what names the state, since a colour alone cannot.
export const STATUS_COLOR: Record<GitBadge, string> = {
	M: 'text-git-modified',
	// added and untracked are both "new" and share one green, the way VS Code reads them
	A: 'text-git-added',
	U: 'text-git-added',
	D: 'text-git-deleted',
	R: 'text-git-renamed'
};

export const STATUS_TITLE: Record<GitBadge, string> = {
	M: m.filetree_badge_modified(),
	A: m.filetree_badge_added(),
	D: m.filetree_badge_deleted(),
	U: m.filetree_badge_untracked(),
	R: m.filetree_badge_renamed()
};
