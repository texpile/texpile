// @vitest-environment jsdom
//
// The export's trip through the language client, against a fake bridge: where to write travels as
// configuration WITH every other setting (tinymist replaces its config whole), the command goes out
// as given, and a slow export outlives the client's usual timeout while nothing else does.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { releaseTypstLsp, stopTypstClient, typstClient, typstLspExtension } from '$lib/languages/typst/intellisense/lspClient';
import { requestTypstExport } from '$lib/languages/typst/export/exportRequest';
import { mainFile } from '$lib/workspace/workspaceStore';

type Msg = { id?: number; method?: string; params?: { settings?: Record<string, unknown>; command?: string; arguments?: unknown[] } };

let sent: Msg[] = [];
let deliver: ((raw: string) => void) | null = null;
/** how long the fake takes over an export, in (fake) milliseconds */
let exportDelay = 0;

function reply(id: number, result: unknown): void {
	deliver?.(JSON.stringify({ jsonrpc: '2.0', id, result }));
}

function answer(msg: Msg): void {
	if (msg.id === undefined) return;
	const id = msg.id;
	if (msg.params?.command === 'tinymist.exportPng') {
		setTimeout(() => reply(id, { items: [{ page: 0, path: '/out/p-1.png', data: null }], total_pages: 1 }), exportDelay);
		return;
	}
	// a hover is never answered: it shows which timeout the requests beside an export get
	if (msg.method === 'textDocument/hover') return;
	queueMicrotask(() => reply(id, msg.method === 'initialize' ? { capabilities: {} } : null));
}

beforeEach(() => {
	sent = [];
	exportDelay = 0;
	window.texpileTypst = {
		startLsp: async () => ({ ok: true }),
		send: (json: string) => {
			const msg = JSON.parse(json) as Msg;
			sent.push(msg);
			answer(msg);
		},
		onMessage: (cb: (raw: string) => void) => void (deliver = cb),
		onExit: () => {},
		stopLsp: () => {}
	} as unknown as NonNullable<typeof window.texpileTypst>;
	mainFile.current = '/p/main.typ';
});

afterEach(() => {
	vi.useRealTimers();
	stopTypstClient();
	mainFile.current = null;
});

const JOB = { command: 'tinymist.exportPng', arguments: ['/p/main.typ', { ppi: 300 }], outputPath: '/out/p-{0p}' };

describe('requestTypstExport', () => {
	it('pushes the destination with every other setting, then runs the command as given', async () => {
		const res = await requestTypstExport('/p', JOB, 60_000);
		const pushes = sent.filter((m) => m.method === 'workspace/didChangeConfiguration');
		expect(pushes.at(-1)!.params!.settings).toEqual({
			formatterMode: 'typstyle',
			lint: { enabled: true, when: 'onType' },
			outputPath: '/out/p-{0p}'
		});
		const run = sent.find((m) => m.params?.command === 'tinymist.exportPng')!;
		expect(run.params!.arguments).toEqual(JOB.arguments);
		// the push is on the pipe before the command that reads it
		expect(sent.indexOf(pushes.at(-1)!)).toBeLessThan(sent.indexOf(run));
		expect(res).toEqual({ items: [{ page: 0, path: '/out/p-1.png', data: null }], total_pages: 1 });
	});

	it('waits out an export longer than the client timeout, and leaves that timeout alone for the rest', async () => {
		const client = await typstClient('/p');
		await client!.initializing;
		vi.useFakeTimers();
		exportDelay = 30_000;
		const pending = requestTypstExport('/p', JOB, 60_000);
		// a request made while the export runs keeps the ordinary timeout
		const other = client!.request('textDocument/hover', {}).then(
			() => 'answered',
			(e: Error) => e.message
		);
		await vi.advanceTimersByTimeAsync(30_000);
		await expect(pending).resolves.toMatchObject({ total_pages: 1 });
		await expect(other).resolves.toBe('Request timed out');
		expect((client as unknown as { timeout: number }).timeout).toBe(10_000);
	});

	it('keeps the server up while it runs, though the last .typ editor closes under it', async () => {
		const stopLsp = vi.fn();
		window.texpileTypst!.stopLsp = stopLsp;
		// the editor that starts the server, then closes while the export runs
		await typstLspExtension('/p', '/p/main.typ');
		await (await typstClient('/p'))!.initializing;
		vi.useFakeTimers();
		exportDelay = 60_000;
		const pending = requestTypstExport('/p', JOB, 600_000);
		releaseTypstLsp();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(stopLsp).not.toHaveBeenCalled();
		await expect(pending).resolves.toMatchObject({ total_pages: 1 });
		// handed back once it is done, so the idle stop still comes
		await vi.advanceTimersByTimeAsync(30_000);
		expect(stopLsp).toHaveBeenCalled();
	});

	it('keeps the reference an editor in the next folder took, when the server restarts for it', async () => {
		await typstLspExtension('/p', '/p/main.typ');
		// the folder switch: the old editor closes, the new folder's opens and restarts the server
		releaseTypstLsp();
		mainFile.current = '/q/main.typ';
		await typstLspExtension('/q', '/q/main.typ');
		const stopLsp = vi.fn();
		window.texpileTypst!.stopLsp = stopLsp;
		vi.useFakeTimers();
		const pending = requestTypstExport('/q', JOB, 60_000);
		await vi.advanceTimersByTimeAsync(60_000);
		await pending;
		expect(stopLsp).not.toHaveBeenCalled();
	});

	it('answers null when there is no tinymist bridge', async () => {
		window.texpileTypst = undefined;
		expect(await requestTypstExport('/p', JOB, 1000)).toBeNull();
	});
});
