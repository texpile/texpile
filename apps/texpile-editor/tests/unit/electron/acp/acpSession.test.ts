import { it, expect, afterAll, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AcpSession, type AcpEvent } from '../../../../../../electron/src/ai/acp/acpSession';
import { noteOwnWrite } from '../../../../../../electron/src/ai/acp/ownWrites';
import { registerFsIpc } from '../../../../../../electron/src/ipc/fsIpc';

// the file tree's operations go through the real fs:* handlers; Electron is stood in for
const h = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => Promise<{ ok: boolean }>>(), userData: '' }));
vi.mock('electron', async () => {
	const { rm } = await import('node:fs/promises');
	return {
		app: { getPath: () => h.userData },
		BrowserWindow: { fromWebContents: () => null },
		dialog: {},
		ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => Promise<{ ok: boolean }>) => h.handlers.set(channel, fn) },
		shell: { trashItem: (p: string) => rm(p, { recursive: true }) }
	};
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'texpile acp '));
h.userData = path.join(dir, 'user data');
registerFsIpc();
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

async function fsCall(channel: string, body: unknown): Promise<void> {
	expect(await h.handlers.get(channel)!({}, body)).toMatchObject({ ok: true });
}

// an ACP agent over JSON lines: asks before it edits main.tex (and deletes old.tex) in its folder, or wants a sign-in first
function fakeAgent(name: string, wantsSignIn: boolean): string {
	const file = path.join(dir, name);
	fs.writeFileSync(
		file,
		`const fs = require('node:fs');
		const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\\n');
		let prompt = null;
		let rest = '';
		process.stdin.on('data', (d) => {
			const lines = (rest + d).split('\\n');
			rest = lines.pop();
			for (const l of lines) {
				const msg = JSON.parse(l);
				if (msg.method === 'initialize') send({ id: msg.id, result: { protocolVersion: 1, agentCapabilities: {}, authMethods: [] } });
				else if (msg.method === 'session/new' && ${wantsSignIn}) send({ id: msg.id, error: { code: -32000, message: 'Authentication required' } });
				else if (msg.method === 'session/new') send({ id: msg.id, result: { sessionId: 's1' } });
				else if (msg.method === 'session/prompt') {
					prompt = msg.id;
					send({ id: 'ask', method: 'session/request_permission', params: { sessionId: 's1', toolCall: { toolCallId: 't1', title: 'Edit main.tex' },
						options: [{ optionId: 'yes', name: 'Allow', kind: 'allow_once' }, { optionId: 'no', name: 'Reject', kind: 'reject_once' }] } });
				} else if (msg.id === 'ask') {
					if (msg.result.outcome.optionId === 'yes') {
						fs.writeFileSync('main.tex', 'new text');
						fs.rmSync('old.tex', { force: true });
					}
					send({ method: 'session/update', params: { sessionId: 's1', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Done.' } } } });
					send({ id: prompt, result: { stopReason: 'end_turn' } });
				}
			}
		});`
	);
	return file;
}

// `whileAsking` runs as the agent waits on its question, in the middle of the turn
function session(name: string, wantsSignIn: boolean, root: string, events: AcpEvent[], whileAsking: () => unknown = () => {}): AcpSession {
	const s: AcpSession = new AcpSession({
		program: process.execPath,
		args: [fakeAgent(name, wantsSignIn)],
		env: {},
		root,
		version: '0.0.0',
		mcp: null,
		emit: (e) => {
			events.push(e);
			if (e.type !== 'permission') return;
			void Promise.resolve(whileAsking()).then(() => s.answer(e.id, 'yes'));
		}
	});
	return s;
}

async function until(events: AcpEvent[], state: string): Promise<void> {
	for (let i = 0; i < 100 && !events.some((e) => e.type === 'state' && e.state === state); i++) await new Promise((r) => setTimeout(r, 50));
}

it('asks the window before the agent acts, and reports the file the turn changed with its text from before', async () => {
	const root = fs.mkdtempSync(path.join(dir, 'turn '));
	fs.writeFileSync(path.join(root, 'main.tex'), 'old text');
	fs.writeFileSync(path.join(root, 'notes.tex'), 'draft');
	const events: AcpEvent[] = [];
	// the reader saves another file while the agent works: theirs, not the agent's, and not to be reverted
	const s = session('editor.cjs', false, root, events, () => {
		noteOwnWrite(path.join(root, 'notes.tex'), 'typed meanwhile');
		fs.writeFileSync(path.join(root, 'notes.tex'), 'typed meanwhile');
	});
	await s.start();
	const result = await s.prompt([{ type: 'text', text: 'fix it' }]);
	s.close();
	expect(events.some((e) => e.type === 'permission')).toBe(true);
	expect(result).toEqual({
		ok: true,
		stopReason: 'end_turn',
		changes: [{ path: path.join(root, 'main.tex'), kind: 'modified', before: 'old text' }]
	});
});

it('reads an agent that wants a sign-in as signed out, not as failed', async () => {
	const events: AcpEvent[] = [];
	const s = session('signed-out.cjs', true, fs.mkdtempSync(path.join(dir, 'auth ')), events);
	await s.start();
	await until(events, 'signed-out');
	s.close();
	expect(events.filter((e) => e.type === 'state').map((e) => (e as { state: string }).state)).toEqual(['starting', 'signed-out']);
});

it('leaves out what Texpile saved during the turn in files the snapshot does not read', async () => {
	const root = fs.mkdtempSync(path.join(dir, 'skipped '));
	fs.writeFileSync(path.join(root, 'main.tex'), 'old text');
	const big = 'x'.repeat(2 * 1024 * 1024);
	fs.writeFileSync(path.join(root, 'thesis.tex'), big);
	const events: AcpEvent[] = [];
	// a comment the agent made through Texpile's tools lands in .texpile, and the reader types on in a large file
	const s = session('skipped.cjs', false, root, events, () => {
		for (const [file, text] of [
			['.texpile/comments.jsonl', '{"type":"comment"}\n'],
			['thesis.tex', `${big} typed`]
		]) {
			noteOwnWrite(path.join(root, file), text);
			fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
			fs.writeFileSync(path.join(root, file), text);
		}
	});
	await s.start();
	const result = await s.prompt([{ type: 'text', text: 'fix it' }]);
	s.close();
	expect(result.changes).toEqual([{ path: path.join(root, 'main.tex'), kind: 'modified', before: 'old text' }]);
});

it('sends no prompt when Stop comes while the turn is still reading the folder', async () => {
	const root = fs.mkdtempSync(path.join(dir, 'stop '));
	fs.writeFileSync(path.join(root, 'main.tex'), 'old text');
	const events: AcpEvent[] = [];
	const s = session('stop.cjs', false, root, events);
	await s.start();
	const turn = s.prompt([{ type: 'text', text: 'fix it' }]);
	s.cancel();
	const result = await turn;
	s.close();
	expect(result).toEqual({ ok: true, stopReason: 'cancelled', changes: [] });
	expect(fs.readFileSync(path.join(root, 'main.tex'), 'utf8')).toBe('old text');
});

function project(name: string, files: Record<string, string>): string {
	const root = fs.mkdtempSync(path.join(dir, `${name} `));
	for (const [file, text] of Object.entries({ 'main.tex': 'old text', ...files })) {
		fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
		fs.writeFileSync(path.join(root, file), text);
	}
	return root;
}

it('leaves out what the reader deleted from the file tree during the turn, and still lists what the agent deleted', async () => {
	const root = project('deleted', { 'old.tex': 'the agent deletes this', 'notes.tex': 'n', 'figs.tex': 'f', 'parts/a.tex': 'a' });
	const s = session('deleted.cjs', false, root, [], async () => {
		await fsCall('fs:op', { action: 'delete', path: path.join(root, 'notes.tex') });
		await fsCall('fs:trash', { path: path.join(root, 'figs.tex'), root });
		await fsCall('fs:op', { action: 'delete', path: path.join(root, 'parts') });
	});
	await s.start();
	const result = await s.prompt([{ type: 'text', text: 'fix it' }]);
	s.close();
	expect(result.changes).toEqual([
		{ path: path.join(root, 'main.tex'), kind: 'modified', before: 'old text' },
		{ path: path.join(root, 'old.tex'), kind: 'deleted', before: 'the agent deletes this' }
	]);
});

it('reads a file or a folder the reader renamed during the turn as neither deleted nor added', async () => {
	const root = project('renamed', { 'draft.tex': 'd', 'parts/a.tex': 'a' });
	const s = session('renamed.cjs', false, root, [], async () => {
		await fsCall('fs:op', { action: 'rename', from: path.join(root, 'draft.tex'), to: path.join(root, 'final.tex') });
		await fsCall('fs:op', { action: 'rename', from: path.join(root, 'parts'), to: path.join(root, 'chapters') });
	});
	await s.start();
	const result = await s.prompt([{ type: 'text', text: 'fix it' }]);
	s.close();
	expect(result.changes).toEqual([{ path: path.join(root, 'main.tex'), kind: 'modified', before: 'old text' }]);
});

it('reads a file the reader made, copied in or brought back during the turn as theirs, not as added by the agent', async () => {
	const root = project('added', {});
	const elsewhere = project('elsewhere', { 'extra/c.tex': 'c', 'backup.tex': 'kept by undo' });
	const s = session('added.cjs', false, root, [], async () => {
		await fsCall('fs:op', { action: 'create', path: path.join(root, 'new.tex'), type: 'file', content: '' });
		await fsCall('fs:op', { action: 'copy', from: path.join(elsewhere, 'extra'), to: path.join(root, 'extra') });
		await fsCall('fs:op', { action: 'restore', from: path.join(elsewhere, 'backup.tex'), to: path.join(root, 'restored.tex') });
	});
	await s.start();
	const result = await s.prompt([{ type: 'text', text: 'fix it' }]);
	s.close();
	expect(result.changes).toEqual([{ path: path.join(root, 'main.tex'), kind: 'modified', before: 'old text' }]);
});
