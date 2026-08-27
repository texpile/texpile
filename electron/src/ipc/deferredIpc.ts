// The IPC surfaces that are not needed to put a window on screen.
//
// Loaded eagerly they cost ~46ms of module evaluation before the first BrowserWindow could be
// constructed, because their dependencies are the heavy ones: simple-git, the MCP SDK and zod,
// electron-updater with ajv and js-yaml. None of it is reachable until there is a UI to reach it
// from, so it loads in the idle gap between creating the window and Chromium asking for the first
// asset.
import { readSettings } from '../appSettings';

type Terminal = typeof import('./terminalIpc.js');
type Daemon = typeof import('../draft/draftDaemon.js');
type McpServer = typeof import('../mcp/server.js');

// held for the shutdown hooks: what never loaded has nothing to tear down
let terminal: Terminal | null = null;
let daemon: Daemon | null = null;
let mcpServer: McpServer | null = null;

let started: Promise<void> | null = null;

/** registers everything held back from launch. Idempotent; safe to call from any window. */
export function registerDeferredIpc(): Promise<void> {
	return (started ??= load());
}

// cheapest and most likely to be wanted first; the MCP server last, as nothing in the UI waits on it
const steps: Array<() => Promise<void>> = [
	async () => (await import('./gitIpc.js')).registerGitIpc(),
	async () => (await import('./pdfSaveIpc.js')).registerPdfSaveIpc(),
	async () => (await import('./typstIpc.js')).registerTypstIpc(),
	async () => (await import('./typstPreviewIpc.js')).registerTypstPreviewIpc(),
	async () => (await import('../zotero.js')).registerZotero(),
	async () => (await import('../library.js')).registerLibrary(),
	async () => {
		terminal = await import('./terminalIpc.js');
		terminal.registerTerminalIpc();
	},
	async () => {
		daemon = await import('../draft/draftDaemon.js');
	},
	async () => (await import('./updatesIpc.js')).registerUpdatesIpc(),
	async () => {
		const mcpIpc = await import('./mcpIpc.js');
		mcpIpc.registerMcpIpc();
		mcpServer = await import('../mcp/server.js');
		// A client is configured once and expects us to be listening; making this a per-launch button
		// would surface the failure as a connection error inside the client, not here. So once granted,
		// it starts with the app. A failure to bind must not stop the editor from opening.
		if (readSettings().mcpEnabled) mcpServer.start(mcpIpc.mcpHost()).catch((e: unknown) => console.error('mcp: failed to start', e));
	}
];

// Long enough that the thread is idle for most of it. The renderer spends this stretch scanning the
// folder and reading its first file, and every one of those is a round trip this thread has to
// answer; loading back to back cost the opening document 34ms.
const STEP_GAP_MS = 25;

async function load(): Promise<void> {
	for (const step of steps) {
		await step();
		await new Promise<void>((r) => setTimeout(r, STEP_GAP_MS));
	}
}

/** destructive teardown, for whatever actually loaded */
export function shutdownDeferred(): void {
	terminal?.killAllPtys();
	daemon?.stopDaemon();
	// takes the endpoint file with it, so a stale port/token is never left on disk for the bridge
	void mcpServer?.stop();
}
