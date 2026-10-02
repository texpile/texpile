import { it, expect } from 'vitest';
import { startPrivate, type McpHost } from '../../../../../../electron/src/mcp/server';

// two windows, the second focused
const windows = [1, 2].map((id) => ({ webContents: { id }, isFocused: () => id === 2 }));
const host = {
	userDataDir: '',
	port: 0,
	windows: () => windows.map((w) => ({ webContentsId: w.webContents.id, focused: w.isFocused() })),
	rootFor: (id: number) => `/project${id}`,
	windowObjects: () => windows,
	windowFor: () => null
} as unknown as McpHost;

function call(url: string, method: string, params: object, token?: string): Promise<Response> {
	return fetch(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json, text/event-stream',
			...(token ? { authorization: `Bearer ${token}` } : {})
		},
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
	});
}

const initialize = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } };

// the Agent tab's tools are on whenever the tab is, so the token is all that keeps other programs out
it("answers only the agent given a window's token, and shows it that window alone", async () => {
	const mcp = await startPrivate(host);
	try {
		const replaced = mcp.grant(1);
		const token = mcp.grant(1);
		expect((await call(mcp.url, 'initialize', initialize)).status).toBe(403);
		expect((await call(mcp.url, 'initialize', initialize, 'wrong')).status).toBe(403);
		expect((await call(mcp.url, 'initialize', initialize, replaced)).status).toBe(403);
		const answer = await call(mcp.url, 'initialize', initialize, token);
		expect(answer.status).toBe(200);
		expect(await answer.text()).toContain('"name":"texpile"');
		// window 2 has the focus, and still the agent of window 1 sees only its own
		const state = await (await call(mcp.url, 'tools/call', { name: 'get_editor_state', arguments: {} }, token)).text();
		expect(state).toContain('/project1');
		expect(state).not.toContain('/project2');
		mcp.revoke(1);
		expect((await call(mcp.url, 'initialize', initialize, token)).status).toBe(403);
	} finally {
		await mcp.close();
	}
});
