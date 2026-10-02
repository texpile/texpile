// The MCP server: a loopback HTTP endpoint hosted inside the running Electron main process.
//
// It has to live here rather than being spawned by the client, because the whole point is the LIVE
// editor - which tabs are open, where the caret is, what is unsaved. A freshly spawned process
// would know none of that. Clients that only speak stdio reach this through the `texpile-mcp`
// bridge, which reads the endpoint file below and pipes stdio to this port.
//
// The connected agent already has its own file tools and is better at using them; what it cannot get
// any other way is the editor's state, and what it cannot do is steer the window. Its one change to a
// document is suggest_edit, which goes into the open file as a suggestion the reader decides on. Every
// path a tool takes is checked against the open workspace. The tools live in tools.ts.
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildServer } from './tools';
import type { snapshotWindows } from './windowState';

export type McpHost = {
	/** where the endpoint file goes (app.getPath('userData')) */
	userDataDir: string;
	/** the configured port. Fixed, not ephemeral: see PORT_DEFAULT. */
	port: number;
	/** every open window, in creation order */
	windows(): { webContentsId: number; focused: boolean }[];
	/** the workspace root claimed by a window, or null */
	rootFor(wcId: number): string | null;
	/** raw BrowserWindow list for the state snapshot */
	windowObjects(): Parameters<typeof snapshotWindows>[0];
	/**
	 * The window to act on for a given workspace root, or the focused one when root is omitted.
	 * Resolving by root matters more than it looks: focus follows the user's clicks, so a tool that
	 * always targeted the focused window would steer whichever project they happened to look at.
	 */
	windowFor(root?: string): { win: Parameters<typeof snapshotWindows>[0][number]; root: string | null } | null;
	/** told when a client connects or the last one goes away, for the topbar indicator */
	onConnectionChange?(client: string | null): void;
};

const ENDPOINT_FILE = 'mcp-endpoint.json';

/**
 * A FIXED port, not an ephemeral one, so a client can be configured once and keep working
 * tomorrow. An ephemeral port would change every launch, which is precisely the problem the stdio
 * bridge exists to paper over - with a stable address most clients dial in directly and need no
 * bridge at all.
 *
 * A dev-channel build gets its own port so a test exe can run beside an installed Texpile, the same
 * way it already gets its own settings dir and instance lock.
 */
export const PORT_DEFAULT = 7317;
export const PORT_DEFAULT_DEV = 7318;

let http: Server | null = null;
let host: McpHost | null = null;
let lastError: string | null = null;

export type McpStatus = {
	running: boolean;
	port: number | null;
	/** set when the last start attempt failed, e.g. the port was taken */
	error: string | null;
};

export function status(): McpStatus {
	const addr = http?.address();
	return {
		running: !!http,
		port: addr && typeof addr === 'object' ? addr.port : null,
		error: lastError
	};
}

/**
 * With no token, THIS is the access control, so it carries real weight.
 *
 * A page on any origin can POST to localhost, so a rebound DNS name pointing at 127.0.0.1 is the
 * realistic attack. Any browser context sends an Origin it does not control - a page its own domain,
 * an extension chrome-extension://... - and none of those match, so the request never reaches the
 * protocol layer. Real MCP clients are not browsers and send no Origin at all.
 *
 * Two further things stop a browser regardless: we send no CORS headers, so a page could not read a
 * reply even if one came back, and MCP requires Content-Type: application/json, which a plain form
 * post cannot set.
 */
function originOk(req: IncomingMessage): boolean {
	const origin = req.headers.origin;
	if (!origin) return true;
	return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(origin);
}

/**
 * Stateless mode wants a FRESH server and transport per request. Sharing one across requests
 * survives `initialize` and then fails every later call with a 500, because without a session id
 * the transport has no way to associate a second request with the first one's state. Our tools are
 * all pure request/response, so there is nothing worth keeping between calls anyway, and building a
 * server per call is cheap next to the round trip.
 */
async function handleStateless(req: IncomingMessage, res: ServerResponse, currentHost: () => McpHost | null): Promise<void> {
	const server = buildServer(currentHost);
	const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
	// tear both down when the response ends, however it ends, or each call leaks a transport
	res.on('close', () => {
		void transport.close().catch(() => {});
		void server.close().catch(() => {});
	});
	try {
		await server.connect(transport);
		await transport.handleRequest(req, res);
	} catch (e) {
		console.error('mcp: request failed', e);
		if (!res.headersSent) res.writeHead(500).end('internal error');
	}
}

export async function start(h: McpHost): Promise<McpStatus> {
	if (http) return status();
	host = h;
	lastError = null;

	http = createServer((req: IncomingMessage, res: ServerResponse) => {
		if (!originOk(req)) {
			res.writeHead(403).end('forbidden origin');
			return;
		}
		h.onConnectionChange?.(String(req.headers['user-agent'] || 'MCP client'));
		void handleStateless(req, res, () => host);
	});

	try {
		await new Promise<void>((resolve, reject) => {
			http!.once('error', reject);
			// 127.0.0.1 rather than 0.0.0.0, so this is never reachable off-box
			http!.listen(h.port, '127.0.0.1', resolve);
		});
	} catch (e) {
		// Fail loudly instead of falling back to another port. A silent fallback would leave the
		// user's pasted config pointing at a port we are not on - or worse, at whatever else took
		// it - and that is not something they could reasonably debug.
		const code = (e as NodeJS.ErrnoException).code;
		lastError = code === 'EADDRINUSE' ? `Port ${h.port} is already in use` : String((e as Error).message || e);
		http?.close();
		http = null;
		return status();
	}

	writeEndpointFile(h.userDataDir);
	return status();
}

export async function stop(): Promise<void> {
	const dir = host?.userDataDir;
	const server = http;
	http = null;
	if (server) await new Promise<void>((r) => server.close(() => r()));
	if (dir) removeEndpointFile(dir);
	host?.onConnectionChange?.(null);
	host = null;
}

/** How a stdio bridge finds the current port. */
function writeEndpointFile(dir: string): void {
	const { port } = status();
	try {
		writeFileSync(join(dir, ENDPOINT_FILE), JSON.stringify({ port, pid: process.pid }, null, 2), { mode: 0o600 });
	} catch (e) {
		console.error('mcp: could not write endpoint file', e);
	}
}

function removeEndpointFile(dir: string): void {
	try {
		rmSync(join(dir, ENDPOINT_FILE), { force: true });
	} catch {
		// a leftover file is harmless: nothing is listening on the port it names
	}
}

export type PrivateMcp = {
	url: string;
	/** a secret for the agent in one window, replacing that window's last one */
	grant(wcId: number): string;
	revoke(wcId: number): void;
	close(): Promise<void>;
};

/** the host as one window's agent sees it: that window alone, whatever root a tool names */
function windowScoped(h: McpHost, wcId: number): McpHost {
	function own() {
		return h.windowObjects().filter((w) => w.webContents.id === wcId);
	}
	return {
		...h,
		windows: () => h.windows().filter((w) => w.webContentsId === wcId),
		windowObjects: own,
		windowFor: () => {
			const win = own()[0];
			return win ? { win, root: h.rootFor(wcId) } : null;
		}
	};
}

/**
 * The Agent tab's own way in: the same tools, on a port of the system's choosing, behind a secret that
 * only the agents Texpile starts are told. The server above is the reader's opt-in for any client on the
 * machine, and stays off until they turn it on; this one is written to no endpoint file and does not
 * light the topbar indicator, so it opens nothing the reader did not already open by using the tab.
 */
export async function startPrivate(h: McpHost): Promise<PrivateMcp> {
	const grants = new Map<number, Buffer>();
	const server = createServer((req: IncomingMessage, res: ServerResponse) => {
		const given = Buffer.from(req.headers.authorization ?? '');
		const wcId = [...grants].find(([, expected]) => given.length === expected.length && timingSafeEqual(given, expected))?.[0];
		if (!originOk(req) || wcId === undefined) {
			res.writeHead(403).end('forbidden');
			return;
		}
		void handleStateless(req, res, () => windowScoped(h, wcId));
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	return {
		url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
		grant: (wcId) => {
			const token = randomBytes(32).toString('hex');
			grants.set(wcId, Buffer.from(`Bearer ${token}`));
			return token;
		},
		revoke: (wcId) => void grants.delete(wcId),
		close: () => new Promise<void>((r) => server.close(() => r()))
	};
}
