// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatTypstDocument, stopTypstClient } from '$lib/languages/typst/intellisense/lspClient';
import { mainFile } from '$lib/workspace/workspaceStore';

type Msg = { id?: number; method?: string; params?: { textDocument?: { uri?: string; text?: string } } };

let sent: Msg[] = [];
let deliver: ((raw: string) => void) | null = null;

const EDIT = [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } }, newText: '#let x = 1' }];

function answer(msg: Msg): void {
	if (msg.id === undefined) return;
	const result = msg.method === 'initialize' ? { capabilities: {} } : msg.method === 'textDocument/formatting' ? EDIT : null;
	queueMicrotask(() => deliver?.(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result })));
}

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
		onTinymistFinished: () => () => {},
		stopLsp: () => {}
	} as unknown as NonNullable<typeof window.texpileTypst>;
	mainFile.current = '/p/main.typ';
});

afterEach(() => {
	stopTypstClient();
	mainFile.current = null;
});

describe('Format Document on a Typst file', () => {
	// tinymist formats its own copy of the document, which only a source editor used to give it
	it('gives the server the text first when no source editor holds the file, and lets go of it after', async () => {
		const formatted = await formatTypstDocument('/p', '/p/main.typ', '#let   x=1\n');
		expect(formatted).toBe('#let x = 1\n');
		const methods = sent.map((m) => m.method);
		const opened = methods.indexOf('textDocument/didOpen');
		expect(opened).toBeGreaterThan(-1);
		expect(sent[opened].params?.textDocument).toMatchObject({ uri: 'file:///p/main.typ', text: '#let   x=1\n' });
		expect(methods.indexOf('textDocument/formatting')).toBeGreaterThan(opened);
		expect(methods.indexOf('textDocument/didClose')).toBeGreaterThan(methods.indexOf('textDocument/formatting'));
	});
});
