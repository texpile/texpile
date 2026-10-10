import { expect, it } from 'vitest';
import { problemsIn, snippetFileAt, type SnippetFileList } from '$lib/editor/snippets/file/snippetFiles';

const files: SnippetFileList = { global: '/data/snippets.json', globalPackages: '/data/packages', packages: { project: [], global: [] } };

it('tells the snippet and package files apart, and finds the problems in each', () => {
	expect(snippetFileAt('/p/.texpile/snippets.json', '/p', files)).toEqual({ kind: 'snippets', layer: 'project' });
	expect(snippetFileAt('/data/snippets.json', '/p', files)).toEqual({ kind: 'snippets', layer: 'global' });
	expect(snippetFileAt('/p/.texpile/packages/fixme.json', '/p', files)).toEqual({ kind: 'package', layer: 'project', name: 'fixme' });
	expect(snippetFileAt('/data/packages/soul.json', '/p', files)).toEqual({ kind: 'package', layer: 'global', name: 'soul' });
	expect(snippetFileAt('/p/snippets.json', '/p', files)).toBeNull();
	const problems = [
		{ layer: 'project' as const, name: 'a', reason: 'x' },
		{ layer: 'project' as const, name: '', reason: 'y', file: '.texpile/packages/fixme.json' },
		{ layer: 'global' as const, name: 'b', reason: 'z' }
	];
	expect(problemsIn({ kind: 'snippets', layer: 'project' }, problems).map((p) => p.reason)).toEqual(['x']);
	expect(problemsIn({ kind: 'package', layer: 'project', name: 'fixme' }, problems).map((p) => p.reason)).toEqual(['y']);
});
