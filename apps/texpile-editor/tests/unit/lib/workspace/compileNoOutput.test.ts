// @vitest-environment jsdom
// The support case: a compile command that writes somewhere the app is not watching used to end
// with every panel silent, reading as "compiled ok". finalizeCompile must warn when the run ends
// with no log advanced and nothing at the watched PDF path - and stay quiet when a PDF exists
// (an up-to-date rebuild) or diagnostics arrived.
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
const { toaster } = await import('$lib/modals/toaster-svelte');

const ROOT = 'C:/proj/parent';

function deps(stat: CompileDeps['stat'], record: { onDone?: (out: string) => void }): CompileDeps {
	return {
		getLoadedPath: () => null,
		getCompileCommand: () => '',
		terminalAvailable: () => true,
		mainConfirmed: () => true,
		fileExists: async () => true,
		clearMainFile: () => {},
		commandPending: () => false,
		getSession: () => ({ active: false }) as never,
		getDock: () => ({ runCommand: (_cmd: string, onDone?: (out: string) => void) => (record.onDone = onDone), interrupt: () => {} }),
		stat,
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
		...{}
	} as CompileDeps;
}

let compiler: InstanceType<typeof CompilePipeline>;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	vi.useFakeTimers();
	localStorage.clear();
	workspaceRoot.current = ROOT;
	mainFile.current = `${ROOT}/FOO/book.typ`;
	projectConfigSync.reset();
	projectConfigSync.setTypstPreview(ROOT, false); // route Compile to the terminal
	warn = vi.spyOn(toaster, 'warning').mockImplementation(() => '');
});

afterEach(() => {
	compiler.dispose();
	warn.mockRestore();
	vi.useRealTimers();
});

async function runToFinalize(stat: CompileDeps['stat']) {
	const record: { onDone?: (out: string) => void } = {};
	compiler = new CompilePipeline(deps(stat, record));
	await compiler.runCompile();
	expect(record.onDone).toBeTypeOf('function'); // the terminal ran and finalize is armed
	record.onDone!('');
	await vi.advanceTimersByTimeAsync(500); // past finalizeCompile's 400ms trailing-write beat
}

describe('a compile that exits without writing anything the app watches', () => {
	it('warns, naming the watched path', async () => {
		await runToFinalize(() => Promise.resolve({ exists: false, mtimeMs: 0, size: 0 }));
		expect(warn).toHaveBeenCalledTimes(1);
		const arg = warn.mock.calls[0][0] as { description: string };
		expect(arg.description).toContain('output/book.pdf'); // the typst default's output, root-relative
	});

	it('stays quiet when the PDF exists (an up-to-date rebuild writes nothing new)', async () => {
		await runToFinalize((p) =>
			Promise.resolve(p.endsWith('.pdf') ? { exists: true, mtimeMs: 5, size: 100 } : { exists: false, mtimeMs: 0, size: 0 })
		);
		expect(warn).not.toHaveBeenCalled();
	});

	it('stays quiet when the log advanced - the Problems panel owns that story', async () => {
		let logMtime = 5; // each stat sees a newer log, as a compile writing diagnostics would
		await runToFinalize((p) =>
			Promise.resolve(p.endsWith('.log') ? { exists: true, mtimeMs: (logMtime += 5), size: 40 } : { exists: false, mtimeMs: 0, size: 0 })
		);
		expect(warn).not.toHaveBeenCalled();
	});
});

describe('a compile with the dock never opened', () => {
	it('mounts the dock for its shell and runs, leaving the dock hidden', async () => {
		let mounted = false;
		const ran: string[] = [];
		compiler = new CompilePipeline({
			...deps(() => Promise.resolve({ exists: false, mtimeMs: 0, size: 0 }), {}),
			mountDock: () => (mounted = true),
			getDock: () => (mounted ? { runCommand: (cmd: string) => ran.push(cmd), interrupt: () => {} } : undefined)
		} as CompileDeps);
		await compiler.runCompile();
		await vi.advanceTimersByTimeAsync(100);
		expect(ran).toHaveLength(1);
	});
});

describe('the preview on Compile', () => {
	// an up-to-date rebuild writes no new PDF, so the pane used to stay hidden and the compile looked broken
	it('opens a hidden preview when the run starts', async () => {
		const opened: boolean[] = [];
		const unchanged = () => Promise.resolve({ exists: true, mtimeMs: 5, size: 100 });
		compiler = new CompilePipeline({ ...deps(unchanged, {}), setPdfPaneOpen: (open: boolean) => opened.push(open) } as CompileDeps);
		await compiler.runCompile();
		expect(opened).toEqual([true]);
	});
});
