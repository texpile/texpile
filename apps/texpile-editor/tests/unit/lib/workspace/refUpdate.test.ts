// Following a rename into the files that point at it read each one as UTF-8 and wrote it back so: a
// Latin-1 chapter came back with every accented letter turned into a replacement character.
import { it, expect, vi } from 'vitest';
import { scanRenamedRefs, applyRefUpdate } from '$lib/workspace/refUpdate';
import { workspaceRoot } from '$lib/workspace/workspaceStore';

it('leaves a file that is not UTF-8 as it is, open or closed', async () => {
	workspaceRoot.current = '/p';
	// what the bridge hands over for Latin-1 bytes: the text read as UTF-8, and that it is not
	const mangled = 'Caf\uFFFD \\includegraphics{fig.png}';
	const disk: Record<string, { text: string; encoding: 'utf8' | 'other' }> = {
		'/p/main.tex': { text: '\\includegraphics{fig.png}', encoding: 'utf8' },
		'/p/latin.tex': { text: mangled, encoding: 'other' },
		'/p/open.tex': { text: mangled, encoding: 'other' }
	};
	const writeText = vi.fn(async (_p: string, _c: string) => {});
	const setSourceText = vi.fn();
	const deps = {
		getLoadedPath: () => '/p/open.tex',
		getSourceText: () => mangled,
		loadedReadOnly: () => true,
		setSourceText,
		readText: async (p: string) => disk[p].text,
		readSource: async (p: string) => disk[p],
		scanFiles: async () => Object.keys(disk),
		writeText,
		onActiveFileEdited: () => {}
	};
	const u = await scanRenamedRefs('/p/fig.png', '/p/figs/fig.png', deps);
	expect(u?.hits.map((h) => h.path)).toEqual(['/p/main.tex']);
	await applyRefUpdate(
		{
			...u!,
			hits: Object.keys(disk).map((path) => ({ path, count: 1, dialect: 'tex' as const }))
		},
		deps
	);
	expect(writeText.mock.calls).toEqual([['/p/main.tex', '\\includegraphics{figs/fig.png}']]);
	expect(setSourceText).not.toHaveBeenCalled();
});
