// @vitest-environment jsdom
// the file is rewritten whole from adopted state on every compile setting, so the folder's spelling language has to
// be adopted state too, or the first change to the compile command would delete it
import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({ fs: {} as Record<string, string> }));

vi.mock('$lib/workspace/fileSystem', () => ({
	joinPath: (a: string, b: string) => `${a}/${b}`,
	relativeTo: (root: string, p: string) => p.slice(root.length + 1),
	samePath: (a: string, b: string) => a === b,
	basename: (p: string) => p.split(/[\\/]/).pop() ?? p,
	readTextFile: async (path: string) => {
		if (!(path in h.fs)) throw new Error('ENOENT: ' + path);
		return h.fs[path];
	},
	writeTextFile: async (path: string, content: string) => {
		h.fs[path] = content;
	},
	statFile: async (path: string) => ({ exists: path in h.fs, mtimeMs: 0, size: 0 })
}));
vi.mock('$lib/workspace/texpileDir', () => ({ ensureTexpileIgnore: async () => {} }));

const { workspaceRoot } = await import('$lib/workspace/workspaceStore');
const { projectConfigSync, projectSpelling } = await import('$lib/workspace/projectConfigSync.svelte');

const ROOT = '/proj';
const FILE = '/proj/.texpile/config.json';

describe('the folder spelling language in .texpile/config.json', () => {
	it('is adopted, and kept when a compile setting rewrites the file', async () => {
		workspaceRoot.current = ROOT;
		h.fs[FILE] = JSON.stringify({ v: 1, main: 'main.tex', spelling: { language: 'de' } });
		await projectConfigSync.adopt(ROOT);
		expect(projectSpelling.current).toBe('de');

		projectConfigSync.setOutputs(ROOT, 'latex', { pdf: 'out/main.pdf' });
		await vi.waitFor(() => expect(JSON.parse(h.fs[FILE]).latex).toEqual({ outputs: { pdf: 'out/main.pdf' } }));
		expect(JSON.parse(h.fs[FILE]).spelling).toEqual({ language: 'de' });

		projectConfigSync.setSpelling(ROOT, null);
		await vi.waitFor(() => expect(JSON.parse(h.fs[FILE]).spelling).toBeUndefined());
	});
});
