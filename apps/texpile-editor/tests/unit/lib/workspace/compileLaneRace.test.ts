// @vitest-environment jsdom
// The main-confirm dialog re-enters runCompile synchronously after setMainFile, before the
// $effect refreshing the cached compileCommand runs - the first compile in a fresh Typst folder
// ran LaTeX while the Typst preview opened. runCompile must resolve the command fresh, so these
// hand it a deliberately stale cache and expect the fresh lane to win.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CompileDeps } from '$lib/workspace/compilePipeline.svelte';

vi.mock('$lib/workspace/fileSystem', () => ({
	joinPath: (a: string, b: string) => `${a}/${b}`,
	relativeTo: (root: string, p: string) => p.slice(root.length + 1),
	samePath: (a: string, b: string) => a === b,
	basename: (p: string) => p.split(/[\\/]/).pop() ?? p,
	dirname: (p: string) => p.split(/[\\/]/).slice(0, -1).join('/'),
	readTextFile: () => Promise.reject(new Error('no fs in this test')),
	writeTextFile: () => Promise.resolve(),
	statFile: () => Promise.resolve({ exists: false, mtimeMs: 0, size: 0 })
}));

const { mainFile, workspaceRoot } = await import('$lib/workspace/workspaceStore');
const { projectConfigSync } = await import('$lib/workspace/projectConfigSync.svelte');
const { CompilePipeline } = await import('$lib/workspace/compilePipeline.svelte');

const ROOT = 'C:/proj/parent';

/** deps whose CACHED command is still the LaTeX lane's - the state the race produces */
function staleDeps(record: { previewOpens: number; ran: string[] }, over: Partial<CompileDeps> = {}): CompileDeps {
	return {
		getLoadedPath: () => null,
		getCompileCommand: () => 'latexmk -pdf {main}', // the stale cache
		terminalAvailable: () => true,
		mainConfirmed: () => true,
		fileExists: async () => true,
		clearMainFile: () => {},
		commandPending: () => false,
		getSession: () => ({ active: false }) as never,
		getDock: () => ({ runCommand: (cmd: string) => record.ran.push(cmd), interrupt: () => {} }),
		stat: () => Promise.resolve({ exists: false, mtimeMs: 0, size: 0 }),
		readText: () => Promise.resolve(''),
		create: () => Promise.resolve(),
		fileUrl: (p: string) => p,
		flushSaves: () => Promise.resolve(),
		refreshTree: () => Promise.resolve(),
		mountDock: () => {},
		setPdfPaneOpen: () => {},
		openCompileModal: () => {},
		openMainConfirm: () => {},
		runDraftCompile: () => Promise.resolve(),
		openTypstPreview: () => record.previewOpens++,
		shareCompileState: () => {},
		...over
	} as CompileDeps;
}

let compiler: InstanceType<typeof CompilePipeline>;

beforeEach(() => {
	localStorage.clear();
	workspaceRoot.current = ROOT;
	mainFile.current = `${ROOT}/FOO/book.typ`;
	projectConfigSync.reset();
});

afterEach(() => compiler.dispose());

describe('runCompile with a stale cached command (the main-confirm re-entry)', () => {
	it('routes a .typ main to the Typst preview even while the cache still says latexmk', async () => {
		const record = { previewOpens: 0, ran: [] as string[] };
		compiler = new CompilePipeline(staleDeps(record));
		await compiler.runCompile();
		// preview is Typst's compile surface (on by default); the terminal must not run LaTeX
		expect(record.previewOpens).toBe(1);
		expect(record.ran).toEqual([]);
	});

	it('runs the Typst lane command in the terminal when the preview is off', async () => {
		projectConfigSync.setTypstPreview(ROOT, false);
		const record = { previewOpens: 0, ran: [] as string[] };
		compiler = new CompilePipeline(staleDeps(record));
		await compiler.runCompile();
		expect(record.previewOpens).toBe(0);
		expect(record.ran).toHaveLength(1);
		expect(record.ran[0]).toMatch(/tinymist/);
		expect(record.ran[0]).not.toMatch(/latexmk/);
		// {main} expanded from the CURRENT main file, root-relative
		expect(record.ran[0]).toContain('FOO/book.typ');
	});

	it('a .tex main still compiles with LaTeX - the fresh resolve changes nothing there', async () => {
		mainFile.current = `${ROOT}/main.tex`;
		const record = { previewOpens: 0, ran: [] as string[] };
		// stale cache pointing the OTHER way round, for symmetry
		compiler = new CompilePipeline(staleDeps(record, { getCompileCommand: () => 'tinymist compile {main}' }));
		await compiler.runCompile();
		expect(record.previewOpens).toBe(0);
		expect(record.ran).toHaveLength(1);
		expect(record.ran[0]).toMatch(/latexmk/);
	});
});
