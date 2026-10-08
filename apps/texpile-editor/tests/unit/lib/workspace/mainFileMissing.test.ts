// @vitest-environment jsdom
// The main file can go missing without Texpile touching it: renamed, moved or deleted from
// outside. The pointer used to keep aiming at the dead path, so every compile ran against a file
// that was not there. Checked at the point of use rather than watched, so a file that is briefly
// absent (a checkout in flight) costs nothing.
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

const { mainFile, workspaceRoot, texFiles } = await import('$lib/workspace/workspaceStore');
const { projectConfigSync } = await import('$lib/workspace/projectConfigSync.svelte');
const { CompilePipeline } = await import('$lib/workspace/compilePipeline.svelte');

const ROOT = 'C:/proj';

function makeDeps(over: Partial<CompileDeps>): CompileDeps {
	return {
		getLoadedPath: () => `${ROOT}/main.tex`,
		getCompileCommand: () => 'latexmk -pdf {main}',
		terminalAvailable: () => true,
		mainConfirmed: () => true,
		fileExists: async () => true,
		clearMainFile: () => {},
		commandPending: () => false,
		getSession: () => ({ active: false }) as never,
		getDock: () => ({ runCommand: () => undefined, interrupt: () => {} }),
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
		openTypstPreview: () => {},
		shareCompileState: () => {},
		...over
	} as CompileDeps;
}

let compiler: InstanceType<typeof CompilePipeline>;

beforeEach(() => {
	localStorage.clear();
	workspaceRoot.current = ROOT;
	mainFile.current = `${ROOT}/main.tex`;
	texFiles.current = [{ path: `${ROOT}/main.tex`, name: 'main.tex' }] as never;
	projectConfigSync.reset();
	projectConfigSync.setTypstPreview(ROOT, false);
});

afterEach(() => compiler.dispose());

describe('compiling with a main file that is gone', () => {
	it('clears the pointer and opens the picker instead of compiling', async () => {
		const clearMainFile = vi.fn(() => (mainFile.current = null));
		const openMainConfirm = vi.fn();
		const runCommand = vi.fn();
		compiler = new CompilePipeline(
			makeDeps({
				fileExists: async () => false,
				clearMainFile,
				openMainConfirm,
				getDock: () => ({ runCommand, interrupt: () => {} }) as never
			})
		);
		await compiler.runCompile();
		expect(clearMainFile).toHaveBeenCalled();
		expect(openMainConfirm).toHaveBeenCalled();
		expect(runCommand).not.toHaveBeenCalled(); // nothing ran against the dead path
	});

	it('compiles normally while the main file is there', async () => {
		const openMainConfirm = vi.fn();
		const clearMainFile = vi.fn();
		compiler = new CompilePipeline(makeDeps({ fileExists: async () => true, openMainConfirm, clearMainFile }));
		await compiler.runCompile();
		expect(clearMainFile).not.toHaveBeenCalled();
		expect(openMainConfirm).not.toHaveBeenCalled();
	});
});
