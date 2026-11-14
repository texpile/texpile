// The IPC surfaces that are not needed to put a window on screen.
//
// Loaded eagerly they cost ~46ms of module evaluation before the first BrowserWindow could be
// constructed, because their dependencies are the heavy ones: simple-git, the MCP SDK and zod,
// electron-updater with ajv and js-yaml. None of it is reachable until there is a UI to reach it
// from, so it loads in the idle gap between creating the window and Chromium asking for the first
// asset.
import { ipcMain } from 'electron';
import { readSettings } from '../appSettings';
import { DEFERRED_STEP_CHANNELS, waitsForFirstCall, type DeferredStep } from './deferredChannels';

type Terminal = typeof import('./terminalIpc.js');
type McpServer = typeof import('../mcp/server.js');
type Acp = typeof import('../ai/acp/acpIpc.js');

// held for the shutdown hooks: what never loaded has nothing to tear down
let terminal: Terminal | null = null;
let mcpServer: McpServer | null = null;
let acpIpc: Acp | null = null;

let started: Promise<void> | null = null;

/** registers everything held back from launch. Idempotent; safe to call from any window. */
export function registerDeferredIpc(): Promise<void> {
	return (started ??= load());
}

/** a window that asked for a handler before it existed waits for the last step registering its channel, which also
 *  starts the load */
export function registerDeferredReadyIpc(): void {
	ipcMain.handle('deferred:ready', async (_e, channel: string) => {
		void registerDeferredIpc();
		const last = steps.findLastIndex(([name]) => DEFERRED_STEP_CHANNELS[name].some((c) => channel.startsWith(c)));
		if (last < 0) await registerDeferredIpc();
		else await (held().has(steps[last][0]) ? run(last) : loaded[last].promise);
	});
}

// cheapest and most likely to be wanted first; the MCP server last, as nothing in the UI waits on it.
// Templates lead: an empty folder opens on the starter picker, which lists the saved ones at once.
// Some wait for their first call instead (waitsForFirstCall)
const steps: Array<[DeferredStep, () => Promise<void>]> = [
	['templates', async () => (await import('./templatesIpc.js')).registerTemplatesIpc()],
	['snippets', async () => (await import('./snippetsIpc.js')).registerSnippetsIpc()],
	['fonts', async () => (await import('./fontsIpc.js')).registerFontsIpc()],
	['git', async () => (await import('./gitIpc.js')).registerGitIpc()],
	['localHistory', async () => (await import('./localHistoryIpc.js')).registerLocalHistoryIpc()],
	['pdfSave', async () => (await import('./pdfSaveIpc.js')).registerPdfSaveIpc()],
	['exportTarget', async () => (await import('./exportTargetIpc.js')).registerExportTargetIpc()],
	['typst', async () => (await import('./typstIpc.js')).registerTypstIpc()],
	['toolchain', async () => (await import('./toolchain/toolchainIpc.js')).registerToolchainIpc()],
	['tinymist', async () => (await import('./toolchain/tinymistIpc.js')).registerTinymistIpc()],
	['texLive', async () => (await import('./toolchain/texliveIpc.js')).registerTexLiveIpc()],
	['typstPreview', async () => (await import('./typstPreviewIpc.js')).registerTypstPreviewIpc()],
	['zotero', async () => (await import('../zotero.js')).registerZotero()],
	['doi', async () => (await import('./doiIpc.js')).registerDoiIpc()],
	['agent', async () => (await import('./agentIpc.js')).registerAgentIpc()],
	[
		'acp',
		async () => {
			acpIpc = await import('../ai/acp/acpIpc.js');
			acpIpc.registerAcpIpc();
		}
	],
	[
		'terminal',
		async () => {
			terminal = await import('./terminalIpc.js');
			terminal.registerTerminalIpc();
		}
	],
	['updates', async () => (await import('./updatesIpc.js')).registerUpdatesIpc()],
	[
		'mcp',
		async () => {
			const mcpIpc = await import('./mcpIpc.js');
			mcpIpc.registerMcpIpc();
			mcpServer = await import('../mcp/server.js');
			// A client is configured once and expects us to be listening; making this a per-launch button
			// would surface the failure as a connection error inside the client, not here. So once granted,
			// it starts with the app. A failure to bind must not stop the editor from opening.
			if (readSettings().mcpEnabled) mcpServer.start(mcpIpc.mcpHost()).catch((e: unknown) => console.error('mcp: failed to start', e));
		}
	]
];

// Long enough that the thread is idle for most of it. The renderer spends this stretch scanning the
// folder and reading its first file, and every one of those is a round trip this thread has to
// answer; loading back to back cost the opening document 34ms.
const STEP_GAP_MS = 25;

const loaded = steps.map(() => Promise.withResolvers<void>());
const running: (Promise<void> | undefined)[] = [];

function run(i: number): Promise<void> {
	return (running[i] ??= steps[i][1]());
}

let heldSteps: Set<DeferredStep> | null = null;

// read once: a step that waits for its first call stays that way until the app is started again
function held(): Set<DeferredStep> {
	if (!heldSteps) {
		const mcpEnabled = !!readSettings().mcpEnabled;
		heldSteps = new Set(steps.map(([name]) => name).filter((name) => waitsForFirstCall(name, mcpEnabled)));
	}
	return heldSteps;
}

async function load(): Promise<void> {
	for (const [i, [name]] of steps.entries()) {
		if (held().has(name)) continue;
		await run(i);
		loaded[i].resolve();
		await new Promise<void>((r) => setTimeout(r, STEP_GAP_MS));
	}
}

/** destructive teardown, for whatever actually loaded */
export function shutdownDeferred(): void {
	terminal?.killAllPtys();
	acpIpc?.closeAllAcp();
	// takes the endpoint file with it, so a stale port/token is never left on disk for the bridge
	void mcpServer?.stop();
}
