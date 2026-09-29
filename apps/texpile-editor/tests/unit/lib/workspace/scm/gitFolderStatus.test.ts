// A folder takes the weightiest change inside it, so a changed chapter can be found in the tree
// without opening every folder; a file still being combined outranks everything.
import { it, expect } from 'vitest';
import { foldersOf } from '$lib/workspace/scm/gitStore';

it('marks every folder up to the project, and no further', () => {
	expect(foldersOf({ '/p/chapters/intro/a.tex': 'M' }, '/p')).toEqual({ '/p/chapters/intro': 'M', '/p/chapters': 'M' });
	expect(foldersOf({ '/p/main.tex': 'M' }, '/p/')).toEqual({});
});

it('lets a conflict outrank a change, and a change outrank a new file', () => {
	const folders = foldersOf(
		{
			'/p/ch/new.tex': 'U',
			'/p/ch/figs/plot.pdf': 'A',
			'/p/ch/old.tex': 'D',
			'/p/data/merge.tex': 'C',
			'/p/data/x.csv': 'M'
		},
		'/p'
	);
	expect(folders).toEqual({ '/p/ch': 'M', '/p/ch/figs': 'A', '/p/data': 'C' });
});
