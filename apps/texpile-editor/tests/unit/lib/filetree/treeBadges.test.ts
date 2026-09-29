// A big new folder comes from Source Control as one row keyed by the folder. The tree still has
// to colour the folder and everything in it, not only the folders above it.
import { it, expect } from 'vitest';
import { gitBadgeOf } from '$lib/filetree/treeBadges';
import { gitFolderStatus, foldersOf } from '$lib/workspace/scm/gitStore';
import type { GitBadge } from '$lib/workspace/scm/git';

it('colours a collapsed new folder, its files and its subfolders', () => {
	const status: Record<string, GitBadge> = { '/p/chapters/figs': 'U', '/p/main.tex': 'M' };
	gitFolderStatus.current = foldersOf(status, '/p');
	const at = (path: string, type: 'file' | 'dir' = 'file') => gitBadgeOf(status, { name: path.split('/').pop()!, path, type });

	expect(at('/p/chapters', 'dir')).toBe('A');
	expect(at('/p/chapters/figs', 'dir')).toBe('U');
	expect(at('/p/chapters/figs/a.png')).toBe('U');
	expect(at('/p/chapters/figs/raw', 'dir')).toBe('U');
	expect(at('/p/chapters/figs/raw/b.png')).toBe('U');
	// untouched neighbours stay uncoloured
	expect(at('/p/chapters/intro.tex')).toBeUndefined();
	expect(at('/p/main.tex')).toBe('M');
	gitFolderStatus.current = {};
});
