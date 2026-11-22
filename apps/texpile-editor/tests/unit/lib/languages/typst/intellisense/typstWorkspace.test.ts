// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { fileUri, stopTypstClient, typstClient, typstLspExtension } from '$lib/languages/typst/intellisense/lspClient';
import { RECHECK_QUIET_MS } from '$lib/languages/typst/intellisense/quietRecheck';

const ROOT = '/proj';
const MAIN = '/proj/main.typ';
const URI = fileUri(MAIN);

type Wire = { id?: number; method?: string; params?: { textDocument?: { uri: string }; command?: string } };

let wire: Wire[] = [];
let deliver: ((raw: string) => void) | null = null;

function installBridge(): void {
	const bridge = {
		startLsp: async () => ({ ok: true }),
		send(json: string) {
			const msg = JSON.parse(json) as Wire;
			wire.push(msg);
			if (msg.id === undefined || !msg.method) return;
			const result = msg.method === 'initialize' ? { capabilities: { textDocumentSync: { openClose: true, change: 2 } } } : null;
			deliver?.(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
		},
		onMessage(cb: (raw: string) => void) {
			deliver = cb;
		},
		onExit() {},
		onTinymistFinished: () => () => {},
		stopLsp() {}
	};
	(window as unknown as { texpileTypst: unknown }).texpileTypst = bridge;
}

function pins(): number {
	return wire.filter((m) => m.params?.command === 'tinymist.pinMain').length;
}

function publish(): void {
	deliver?.(JSON.stringify({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri: URI, diagnostics: [] } }));
}

async function mountSourceEditor(doc: string): Promise<EditorView> {
	const client = await typstClient(ROOT);
	await client!.initializing;
	const ext = await typstLspExtension(ROOT, MAIN);
	const view = new EditorView({ state: EditorState.create({ doc, extensions: [ext!] }), parent: document.body });
	await vi.advanceTimersByTimeAsync(0);
	return view;
}

describe('a quiet document', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		wire = [];
		installBridge();
	});

	afterEach(() => {
		stopTypstClient();
		vi.useRealTimers();
	});

	it('is compiled once more after typing stops', async () => {
		const view = await mountSourceEditor('= One');
		const pinned = pins();
		view.dispatch({ changes: { from: 5, insert: ' two' } });
		await vi.advanceTimersByTimeAsync(RECHECK_QUIET_MS);
		expect(pins()).toBe(pinned + 1);

		// the recheck's own answer asks for nothing more
		publish();
		await vi.advanceTimersByTimeAsync(RECHECK_QUIET_MS * 3);
		expect(pins()).toBe(pinned + 1);
		view.destroy();
	});

	it('waits for the burst of publishes after the last edit to end', async () => {
		const view = await mountSourceEditor('= One');
		const pinned = pins();
		view.dispatch({ changes: { from: 5, insert: '!' } });
		await vi.advanceTimersByTimeAsync(RECHECK_QUIET_MS - 100);
		publish();
		await vi.advanceTimersByTimeAsync(RECHECK_QUIET_MS - 100);
		expect(pins()).toBe(pinned);
		await vi.advanceTimersByTimeAsync(100);
		expect(pins()).toBe(pinned + 1);
		view.destroy();
	});
});
