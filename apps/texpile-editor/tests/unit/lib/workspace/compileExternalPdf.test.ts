// @vitest-environment jsdom
// The PDF pane follows the disk when something other than Texpile's Compile writes the PDF (an
// agent's latexmk, latexmk -pvc). It must NOT follow during our own run, where the engine rewrites
// the PDF across passes, and must wait for a file that is still changing.
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
const { CompilePipeline, resolveCompileCommand } = await import('$lib/workspace/compilePipeline.svelte');
const { pdfStore } = await import('$lib/stores/pdfStore');

const ROOT = 'C:/proj/parent';

function deps(stat: CompileDeps['stat']): CompileDeps {
	return {
		getLoadedPath: () => null,
		getCompileCommand: () => resolveCompileCommand(mainFile.current),
		terminalAvailable: () => true,
		mainConfirmed: () => true,
		fileExists: async () => true,
		clearMainFile: () => {},
		commandPending: () => false,
		getSession: () => ({ active: false, pushPdf: () => Promise.resolve() }) as never,
		getDock: () => ({ runCommand: () => {}, interrupt: () => {} }),
		stat,
		readText: () => Promise.resolve(''),
		create: () => Promise.resolve(),
		fileUrl: (p: string) => p,
		flushSaves: () => Promise.resolve(),
		refreshTree: () => Promise.resolve(),
		showTerminal: () => {},
		setDockView: () => {},
		setPdfPaneOpen: () => {},
		openCompileModal: () => {},
		openMainConfirm: () => {},
		runDraftCompile: () => Promise.resolve(),
		openTypstPreview: () => {},
		shareCompileState: () => {}
	} as CompileDeps;
}

let compiler: InstanceType<typeof CompilePipeline>;

beforeEach(() => {
	vi.useFakeTimers();
	localStorage.clear();
	workspaceRoot.current = ROOT;
	mainFile.current = `${ROOT}/FOO/book.typ`;
	projectConfigSync.reset();
	projectConfigSync.setTypstPreview(ROOT, false);
	pdfStore.current = null;
});

afterEach(() => {
	compiler.dispose();
	vi.useRealTimers();
});

async function load(stat: CompileDeps['stat']) {
	compiler = new CompilePipeline(deps(stat));
	const p = compiler.loadExternalPdf();
	await vi.advanceTimersByTimeAsync(700); // past the settle beat
	await p;
}

describe('a PDF written outside Texpile', () => {
	it('lands in the pane once two stats agree', async () => {
		await load(() => Promise.resolve({ exists: true, mtimeMs: 50, size: 100 }));
		expect(pdfStore.current).toBe(`${ROOT}/output/book.pdf&t=50`);
		expect(compiler.runsFinished).toBe(1);
	});

	it('is ignored while our own compile runs, which rewrites the PDF per pass', async () => {
		compiler = new CompilePipeline(deps(() => Promise.resolve({ exists: true, mtimeMs: 50, size: 100 })));
		compiler.busy = true;
		const p = compiler.loadExternalPdf();
		await vi.advanceTimersByTimeAsync(700);
		await p;
		expect(pdfStore.current).toBeNull();
	});

	it('waits for the next watcher event while the file is still changing', async () => {
		let mtime = 50;
		await load(() => Promise.resolve({ exists: true, mtimeMs: (mtime += 5), size: 100 }));
		expect(pdfStore.current).toBeNull();
	});

	it('does nothing when the shown PDF is already the one on disk', async () => {
		pdfStore.current = `${ROOT}/output/book.pdf&t=50`;
		await load(() => Promise.resolve({ exists: true, mtimeMs: 50, size: 100 }));
		expect(compiler.runsFinished).toBe(0);
	});

	it('clears the pane when the PDF is deleted', async () => {
		pdfStore.current = `${ROOT}/output/book.pdf&t=50`;
		await load(() => Promise.resolve({ exists: false, mtimeMs: 0, size: 0 }));
		expect(pdfStore.current).toBeNull();
	});

	it('keeps the pane when a deleted PDF is back before the second stat', async () => {
		pdfStore.current = `${ROOT}/output/book.pdf&t=50`;
		let calls = 0;
		await load(() => Promise.resolve(calls++ === 0 ? { exists: false, mtimeMs: 0, size: 0 } : { exists: true, mtimeMs: 80, size: 100 }));
		expect(pdfStore.current).toBe(`${ROOT}/output/book.pdf&t=50`);
	});
});
