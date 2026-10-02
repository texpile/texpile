// The agent panel's conversations, one per window. The folder is the one the window has open and the
// program comes from settings.json, so a request from a window chooses neither
import { app, ipcMain, type WebContents } from 'electron';
import type { ContentBlock } from '@agentclientprotocol/sdk';
import { readSettings } from '../../appSettings';
import { agentsDir } from '../../appIdentity';
import { findProgram } from '../../shell/findProgram';
import { shellEnvReady } from '../../shell/shellEnv';
import { folderOf } from '../../windows/windowRegistry';
import { agentLaunch, PANEL_PRESETS, presetProgram, type PanelAgent } from './acpAgents';
import { AcpSession, type AcpEvent } from './acpSession';
import type { PrivateMcp } from '../../mcp/server';

const sessions = new Map<number, AcpSession>();
/** windows already watched for closing */
const watched = new Set<number>();

/** Texpile's own tools for every agent the tab starts, from the first until the app quits. Not the MCP
 *  server in Preferences: see startPrivate */
let privateMcp: Promise<PrivateMcp | null> | null = null;
/** the endpoint once it is up, so a closing conversation takes its window's token back at once */
let privateMcpUp: PrivateMcp | null = null;

function agentMcp(): Promise<PrivateMcp | null> {
	privateMcp ??= Promise.all([import('../../mcp/server.js'), import('../../ipc/mcpIpc.js')])
		.then(([server, ipc]) => server.startPrivate(ipc.mcpHost()))
		.then((m) => (privateMcpUp = m))
		.catch((e: unknown) => {
			// the agent still works, on the folder alone
			console.error('acp: could not start the tools endpoint', e);
			return null;
		});
	return privateMcp;
}

function send(wc: WebContents, event: AcpEvent): void {
	if (!wc.isDestroyed()) wc.send('acp:event', event);
}

function closeFor(wcId: number): void {
	sessions.get(wcId)?.close();
	sessions.delete(wcId);
	privateMcpUp?.revoke(wcId);
}

/** `agent` is the one started, which a later choice in another window's Preferences does not change */
type StartResult = { ok: true; agent: PanelAgent } | { ok: false; reason: 'no-folder' | 'unset' | 'missing'; program?: string };

async function start(wc: WebContents): Promise<StartResult> {
	closeFor(wc.id);
	const root = folderOf(wc.id);
	if (!root) return { ok: false, reason: 'no-folder' };
	await shellEnvReady();
	const s = readSettings();
	const launch = agentLaunch(s.agentPanel, s.agentPanelCommand, { findProgram, adapterDir: agentsDir(), execPath: process.execPath });
	if (!launch.ok)
		return launch.reason === 'missing' ? { ok: false, reason: 'missing', program: launch.program } : { ok: false, reason: 'unset' };
	const mcp = await agentMcp();
	// a start that overlapped this one may have put its session in while this one waited
	closeFor(wc.id);
	const session = new AcpSession({
		...launch,
		root,
		version: app.getVersion(),
		mcp: mcp && { url: mcp.url, token: mcp.grant(wc.id) },
		emit: (e) => send(wc, e)
	});
	sessions.set(wc.id, session);
	if (!watched.has(wc.id)) {
		watched.add(wc.id);
		const id = wc.id;
		wc.once('destroyed', () => {
			watched.delete(id);
			closeFor(id);
		});
	}
	void session.start();
	return { ok: true, agent: s.agentPanel as PanelAgent };
}

function isContent(blocks: unknown): blocks is ContentBlock[] {
	return Array.isArray(blocks) && blocks.every((b) => b && typeof b === 'object' && typeof (b as { type?: unknown }).type === 'string');
}

export function registerAcpIpc(): void {
	ipcMain.handle('acp:detect', async () => {
		await shellEnvReady();
		return Object.fromEntries(PANEL_PRESETS.map((a) => [a, findProgram(presetProgram(a)) !== null]));
	});
	ipcMain.handle('acp:start', (e) => start(e.sender));
	ipcMain.handle('acp:prompt', (e, blocks: unknown) => {
		const session = sessions.get(e.sender.id);
		if (!session || !isContent(blocks)) return { ok: false, error: 'bad request', changes: [] };
		return session.prompt(blocks);
	});
	ipcMain.on('acp:cancel', (e) => sessions.get(e.sender.id)?.cancel());
	ipcMain.on('acp:answer', (e, req: { id?: unknown; optionId?: unknown }) => {
		if (typeof req?.id !== 'string') return;
		sessions.get(e.sender.id)?.answer(req.id, typeof req.optionId === 'string' ? req.optionId : null);
	});
	ipcMain.handle('acp:config', (e, req: { configId?: unknown; value?: unknown }) => {
		if (typeof req?.configId !== 'string' || typeof req.value !== 'string') return;
		return sessions.get(e.sender.id)?.setConfig(req.configId, req.value);
	});
	ipcMain.handle('acp:chats', (e) => sessions.get(e.sender.id)?.listChats() ?? []);
	ipcMain.handle('acp:openChat', (e, id: unknown) => {
		if (typeof id !== 'string') return { ok: false, error: 'bad request' };
		return sessions.get(e.sender.id)?.openChat(id) ?? { ok: false, error: 'not ready' };
	});
	ipcMain.on('acp:close', (e) => closeFor(e.sender.id));
}

/** every agent goes with the app */
export function closeAllAcp(): void {
	for (const id of [...sessions.keys()]) closeFor(id);
	void privateMcp?.then((m) => m?.close());
	privateMcp = null;
	privateMcpUp = null;
}
