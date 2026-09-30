// @vitest-environment jsdom
//
// What the renderer tells tinymist about itself, against a fake bridge that answers the handshake.
// tinymist REPLACES its configuration on every didChangeConfiguration (keys left out go back to
// their defaults), so the assertion that matters is that every push carries every setting.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { exportTypstPdf, stopTypstClient, typstClient } from '$lib/languages/typst/intellisense/lspClient';
import { mainFile } from '$lib/workspace/workspaceStore';

type Msg = { id?: number; method?: string; params?: { settings?: Record<string, unknown>; command?: string; arguments?: unknown[] } };

let sent: Msg[] = [];
let deliver: ((raw: string) => void) | null = null;

function answer(msg: Msg): void {
	if (msg.id === undefined) return;
	const result =
		msg.method === 'initialize'
			? { capabilities: {} }
			: msg.params?.command === 'tinymist.exportPdf'
				? { path: '/p/build/main.pdf' }
				: null;
	queueMicrotask(() => deliver?.(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result })));
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const pushes = () => sent.filter((m) => m.method === 'workspace/didChangeConfiguration').map((m) => m.params!.settings!);
const pins = () => sent.filter((m) => m.params?.command === 'tinymist.pinMain').map((m) => m.params!.arguments![0]);

beforeEach(() => {
	sent = [];
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
	stopTypstClient();
	mainFile.current = null;
});

describe('tinymist settings', () => {
	it('turns the formatter and the lints on in initialize, which is when tinymist reads the lint switch', async () => {
		const client = await typstClient('/p');
		await client!.initializing;
		expect(sent[0].method).toBe('initialize');
		expect((sent[0].params as { initializationOptions?: unknown }).initializationOptions).toEqual({
			formatterMode: 'typstyle',
			lint: { enabled: true, when: 'onType' }
		});
	});

	it('pins the main once the handshake is done', async () => {
		const client = await typstClient('/p');
		await client!.initializing;
		await tick();
		expect(pins()).toEqual(['/p/main.typ']);
		expect(sent.findIndex((m) => m.params?.command === 'tinymist.pinMain')).toBeGreaterThan(0);
	});

	it('keeps the formatter and the lints in the push an export makes', async () => {
		await typstClient('/p');
		await exportTypstPdf('/p', '/p/main.typ', 'build');
		expect(pushes().at(-1)).toEqual({
			formatterMode: 'typstyle',
			lint: { enabled: true, when: 'onType' },
			outputPath: '$root/build/$name'
		});
	});

	it('re-pins when the main file changes, and unpins for a main that is not Typst', async () => {
		const client = await typstClient('/p');
		await client!.initializing;
		await tick();
		mainFile.current = '/p/thesis.typ';
		flushSync();
		await tick();
		mainFile.current = '/p/paper.tex';
		flushSync();
		await tick();
		expect(pins()).toEqual(['/p/main.typ', '/p/thesis.typ', null]);
	});
});
