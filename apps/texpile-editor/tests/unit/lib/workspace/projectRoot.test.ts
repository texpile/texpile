import { describe, it, expect, vi, beforeEach } from 'vitest';

const present = new Set<string>();

vi.mock('$lib/workspace/fileSystem', () => ({
	dirname: (p: string) => p.replace(/\/[^/]*$/, ''),
	joinPath: (...parts: string[]) => parts.join('/'),
	samePath: (a: string, b: string) => a === b,
	statFile: async (p: string) => ({ exists: present.has(p), mtimeMs: 0, size: 0 }),
	claimWorkspace: async () => ({ ok: true }),
	nativeBridge: () => undefined,
	scanTexFiles: async () => ({ root: '', files: [] })
}));
vi.mock('$lib/workspace/latexParserWorker', () => ({ latexParserWorker: () => {} }));
vi.mock('$lib/router.svelte', () => ({ navigate: () => {} }));

const { projectRootFor } = await import('$lib/workspace/openWorkspace');

beforeEach(() => present.clear());

describe('projectRootFor', () => {
	it('climbs to the nearest marker', async () => {
		present.add('/p/thesis/.texpile');
		expect(await projectRootFor('/p/thesis/chapters/ch01.tex')).toBe('/p/thesis');
	});

	it('takes .git when there is no .texpile', async () => {
		present.add('/p/repo/.git');
		expect(await projectRootFor('/p/repo/src/main.typ')).toBe('/p/repo');
	});

	it('stops after five levels', async () => {
		present.add('/a/.texpile');
		const deep = '/a/b/c/d/e/f/g/main.tex';
		expect(await projectRootFor(deep)).toBe('/a/b/c/d/e/f/g');
	});

	it('falls back to the file own folder', async () => {
		expect(await projectRootFor('/downloads/stray.tex')).toBe('/downloads');
	});
});
