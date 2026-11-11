import { it, expect } from 'vitest';
import { eagerCompile } from '../../../scripts/eagerCompile';

type Bundle = Record<string, { type: 'chunk'; fileName: string; code: string; moduleIds: string[] } | { type: 'asset'; source: string }>;

// V8 reads the hint from a file's first line only, and a profile reads the chunk through its map
it('puts the hint on the first line of a chunk holding a named module, and moves its map down a line', () => {
	const bundle: Bundle = {
		'a.js': {
			type: 'chunk',
			fileName: 'a.js',
			code: 'const preload=1;\nrun()',
			moduleIds: ['/app/src/views/workspace/WorkspaceView.svelte']
		},
		'a.js.map': { type: 'asset', source: JSON.stringify({ version: 3, mappings: ';AAAA' }) },
		'b.js': { type: 'chunk', fileName: 'b.js', code: 'other()', moduleIds: ['/app/src/lib/messages.js'] }
	};
	const hook = eagerCompile(['/src/views/workspace/WorkspaceView.svelte']).generateBundle as {
		order: string;
		handler: (o: unknown, b: Bundle) => void;
	};
	hook.handler({}, bundle);
	expect(hook.order).toBe('post');
	expect((bundle['a.js'] as { code: string }).code).toBe('//# allFunctionsCalledOnLoad\nconst preload=1;\nrun()');
	expect(JSON.parse((bundle['a.js.map'] as { source: string }).source)).toEqual({ version: 3, mappings: ';;AAAA' });
	expect((bundle['b.js'] as { code: string }).code).toBe('other()');
});
