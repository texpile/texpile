// Answering a guest's intellisense with the host's language server.
//
// Two things here can fail quietly and badly, so both are pinned. A path that crosses the boundary
// wrong sends a guest to a file on somebody else's disk, or hands the host a path a crafted frame
// chose. And a request that never settles leaves a guest's editor looking hung rather than
// looking like it has no intellisense.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sessionUri, relFromSessionUri, mapUris } from '$lib/languages/typst/intellisense/guest/sessionUri';
import { createSessionTransport, type SessionLspPort } from '$lib/languages/typst/intellisense/guest/sessionTransport';
import {
	serveGuestLspRequest,
	diagnosticsNotificationForGuest,
	type GuestLspContext
} from '$lib/languages/typst/intellisense/guest/guestLsp';
import { guestRelPath } from '$lib/collab/sessionProvider';
import type { ControlPayload } from '$lib/collab/protocol';
import type { LSPClient } from '@codemirror/lsp-client';

describe('addressing a file that is on the host and nowhere else', () => {
	it('survives a round trip, including characters a path may legally contain', () => {
		for (const rel of ['main.typ', 'chapters/one.typ', 'a folder/b#c.typ', 'ünïcode.typ']) {
			expect(relFromSessionUri(sessionUri(rel))).toBe(rel);
		}
	});

	it('is not a file path, so an unmapped one cannot resolve to a real file', () => {
		expect(sessionUri('main.typ').startsWith('file:')).toBe(false);
		expect(relFromSessionUri('file:///C:/real/main.typ')).toBeNull();
	});

	it('refuses to walk out of the project', () => {
		// the host joins this against a real root, so `..` would be a directory traversal
		expect(relFromSessionUri('texpile-session:/../../etc/passwd')).toBeNull();
		expect(relFromSessionUri('texpile-session:/a/../../b.typ')).toBeNull();
	});
});

describe('the path a guest editor hands over', () => {
	// A guest's WorkspaceView runs on the synthetic 'session' root, so an open document's path
	// arrives prefixed. The host joins whatever it is sent onto its REAL root, so leaving the
	// prefix on makes every request miss - and miss silently, as a file that is simply not there.
	it('is manifest-relative, with the synthetic root taken off', () => {
		expect(guestRelPath('session/main.typ')).toBe('main.typ');
		expect(guestRelPath('session/chapters/one.typ')).toBe('chapters/one.typ');
	});

	it('leaves a path that is already relative alone', () => {
		expect(guestRelPath('main.typ')).toBe('main.typ');
		// not every path starting with those letters is the root
		expect(guestRelPath('sessions/notes.typ')).toBe('sessions/notes.typ');
	});
});

describe('rewriting the URIs inside a message', () => {
	it('rewrites document URIs at any depth and leaves everything else alone', () => {
		const msg = { items: [{ location: { uri: 'A', range: { line: 3 } } }], label: 'A' };
		const out = mapUris(msg, (u) => u + '!');
		expect(out.items[0].location.uri).toBe('A!');
		expect(out.items[0].location.range.line).toBe(3);
		expect(out.label).toBe('A'); // a value that merely equals a URI is not one
	});

	it('drops a URI it cannot map rather than passing a foreign path through', () => {
		const out = mapUris({ uri: 'nope', line: 1 }, () => null) as { uri?: string; line: number };
		expect(out.uri).toBeUndefined();
		expect(out.line).toBe(1);
	});
});

function fakePort() {
	const sent: ControlPayload[] = [];
	let handler: ((p: ControlPayload) => void) | null = null;
	const port: SessionLspPort = {
		send: (p) => sent.push(p),
		subscribe: (h) => {
			handler = h;
			return () => (handler = null);
		}
	};
	return { port, sent, reply: (p: ControlPayload) => handler?.(p) };
}

describe('the guest transport', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('forwards a request and hands the answer back under the same id', () => {
		const { port, sent, reply } = fakePort();
		const t = createSessionTransport(port);
		const got: string[] = [];
		t.subscribe((v) => got.push(v));

		t.send(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'textDocument/hover', params: { x: 1 } }));
		expect(sent).toEqual([{ kind: 'lsp-request', reqId: 7, method: 'textDocument/hover', params: { x: 1 } }]);

		reply({ kind: 'lsp-result', reqId: 7, ok: true, result: { contents: 'hi' } });
		expect(JSON.parse(got[0])).toEqual({ jsonrpc: '2.0', id: 7, result: { contents: 'hi' } });
	});

	it('sends no document sync, because the host is reading the guest edits off its own disk', () => {
		const { port, sent } = fakePort();
		const t = createSessionTransport(port);
		for (const method of ['initialized', 'textDocument/didOpen', 'textDocument/didChange', 'textDocument/didClose', '$/cancelRequest']) {
			t.send(JSON.stringify({ jsonrpc: '2.0', method, params: {} }));
		}
		expect(sent).toEqual([]);
	});

	it('answers shutdown itself, since the host server serves other people', () => {
		const { port, sent } = fakePort();
		const t = createSessionTransport(port);
		const got: string[] = [];
		t.subscribe((v) => got.push(v));
		t.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'shutdown' }));
		expect(sent).toEqual([]);
		expect(JSON.parse(got[0]).result).toBeNull();
	});

	it('settles a request the host never answers, so the editor does not appear to hang', () => {
		const { port } = fakePort();
		const t = createSessionTransport(port, 1000);
		const got: string[] = [];
		t.subscribe((v) => got.push(v));
		t.send(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'textDocument/completion' }));
		expect(got).toEqual([]);
		vi.advanceTimersByTime(1000);
		expect(JSON.parse(got[0]).error.message).toMatch(/did not answer/);
	});

	it('ignores an answer that arrives after its request timed out', () => {
		const { port, reply } = fakePort();
		const t = createSessionTransport(port, 1000);
		const got: string[] = [];
		t.subscribe((v) => got.push(v));
		t.send(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'textDocument/completion' }));
		vi.advanceTimersByTime(1000);
		// id 3 may already have been reused by the client; answering it twice is worse than late
		reply({ kind: 'lsp-result', reqId: 3, ok: true, result: [] });
		expect(got).toHaveLength(1);
	});

	it('fails everything outstanding when the session ends', () => {
		const { port } = fakePort();
		const t = createSessionTransport(port);
		const got: string[] = [];
		t.subscribe((v) => got.push(v));
		t.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'textDocument/hover' }));
		t.dispose();
		expect(JSON.parse(got[0]).error.message).toMatch(/session ended/);
	});
});

describe('pushing the host diagnostics down to guests', () => {
	it('addresses the file the way the guest does', () => {
		const out = diagnosticsNotificationForGuest('C:/proj/chapters/one.typ', [{ message: 'unclosed delimiter' }], 'C:/proj');
		expect(out).toEqual({
			kind: 'lsp-notify',
			method: 'textDocument/publishDiagnostics',
			params: { uri: sessionUri('chapters/one.typ'), diagnostics: [{ message: 'unclosed delimiter' }] }
		});
	});

	it('forwards an empty list, because that is how a file is said to be clean', () => {
		// dropping it as "nothing to report" would strand the previous squiggles on screen
		const out = diagnosticsNotificationForGuest('C:/proj/main.typ', [], 'C:/proj');
		expect((out?.params as { diagnostics: unknown[] }).diagnostics).toEqual([]);
	});

	it('says nothing about a file the guest does not have', () => {
		// tinymist reports against its own stdlib and the package cache too
		expect(diagnosticsNotificationForGuest('C:/other/std.typ', [{ message: 'x' }], 'C:/proj')).toBeNull();
	});
});

const ROOT = 'C:/proj';

function hostCtx(over: Partial<GuestLspContext> & { request?: (m: string, p: unknown) => unknown; capabilities?: unknown } = {}) {
	const seen: { method: string; params: unknown }[] = [];
	const order: string[] = [];
	const client = {
		serverCapabilities: over.capabilities === undefined ? { hoverProvider: true } : over.capabilities,
		initializing: Promise.resolve(null),
		sync: () => order.push('sync'),
		request: (method: string, params: unknown) => {
			order.push('request');
			seen.push({ method, params });
			return Promise.resolve(over.request ? over.request(method, params) : null);
		}
	} as unknown as LSPClient;
	const ctx: GuestLspContext = {
		root: ROOT,
		client: () => Promise.resolve(client),
		flush: async () => void order.push('flush'),
		projectFiles: () => [],
		...over
	};
	return { ctx, seen, order };
}

const req = (method: string, params?: unknown): Extract<ControlPayload, { kind: 'lsp-request' }> => ({
	kind: 'lsp-request',
	reqId: 1,
	method,
	params
});

describe('the host answering a guest', () => {
	it('lands both kinds of stale text before asking, then asks with a real path', async () => {
		// Two independent staleness paths, and which one bites depends on whether the host happens
		// to have the file open: unopened files are read off the DISK (so pending writes must land
		// first), open ones come from tinymist's shadow copy, which ignores the disk entirely and
		// only advances on a sync. Miss either and the guest is answered about a previous keystroke.
		const { ctx, order, seen } = hostCtx();
		await serveGuestLspRequest(req('textDocument/completion', { textDocument: { uri: sessionUri('main.typ') } }), ctx);
		expect(order).toEqual(['flush', 'sync', 'request']);
		expect(seen[0].params).toEqual({ textDocument: { uri: 'file:///C:/proj/main.typ' } });
	});

	it('brings a location back into the guest namespace', async () => {
		const { ctx } = hostCtx({ request: () => ({ uri: 'file:///C:/proj/lib.typ', range: { line: 2 } }) });
		const out = await serveGuestLspRequest(req('textDocument/definition', {}), ctx);
		expect(out.ok).toBe(true);
		expect(out.result).toEqual({ uri: sessionUri('lib.typ'), range: { line: 2 } });
	});

	it('does not hand back a path outside the project', async () => {
		// tinymist resolves builtins into its own stdlib; a guest cannot open that, and it is a
		// location on someone else's machine
		const { ctx } = hostCtx({ request: () => ({ uri: 'file:///C:/other/std.typ', range: {} }) });
		const out = await serveGuestLspRequest(req('textDocument/definition', {}), ctx);
		expect((out.result as { uri?: string }).uri).toBeUndefined();
	});

	it("brings a path's link into the guest namespace, and drops one outside the project", async () => {
		const links = [
			{ range: { start: { line: 0, character: 7 } }, target: 'file:///C:/proj/fig.png' },
			{ range: { start: { line: 1, character: 7 } }, target: 'file:///C:/other/secret.png' }
		];
		const { ctx } = hostCtx({ request: () => links });
		const out = await serveGuestLspRequest(req('textDocument/documentLink', {}), ctx);
		expect(out.ok).toBe(true);
		const [inside, outside] = out.result as { target?: string }[];
		expect(inside.target).toBe(sessionUri('fig.png'));
		expect(outside.target).toBeUndefined();
	});

	it('answers initialize from cache instead of initialising a running server twice', async () => {
		const { ctx, seen } = hostCtx();
		const out = await serveGuestLspRequest(req('initialize', {}), ctx);
		expect(out.result).toEqual({ capabilities: { hoverProvider: true } });
		expect(seen).toEqual([]);
	});

	it('fails initialize rather than answer it with no capabilities', async () => {
		// empty capabilities do not error anywhere - they just register no completion provider, so
		// the guest's editor silently never responds to '#'. Failing is the diagnosable outcome.
		const { ctx } = hostCtx({ capabilities: null });
		const out = await serveGuestLspRequest(req('initialize', {}), ctx);
		expect(out.ok).toBe(false);
	});

	it('refuses a method that is not on the list, since this runs on the host machine', async () => {
		const { ctx, seen } = hostCtx();
		const out = await serveGuestLspRequest(req('workspace/executeCommand', { command: 'rm' }), ctx);
		expect(out.ok).toBe(false);
		expect(seen).toEqual([]);
	});

	it('reports a dead server as a failed answer rather than leaving the guest waiting', async () => {
		const { ctx } = hostCtx({ client: () => Promise.resolve(null) });
		const out = await serveGuestLspRequest(req('textDocument/hover', {}), ctx);
		expect(out).toMatchObject({ ok: false, reqId: 1 });
	});

	it('turns a thrown server error into an answer, for the same reason', async () => {
		const { ctx } = hostCtx({
			request: () => {
				throw new Error('server exploded');
			}
		});
		const out = await serveGuestLspRequest(req('textDocument/hover', {}), ctx);
		expect(out).toMatchObject({ ok: false, error: 'server exploded' });
	});
});
