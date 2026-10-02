import { it, expect, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AcpSession, type AcpEvent } from '../../../../../../electron/src/ai/acp/acpSession';
import { noteOwnWrite } from '../../../../../../electron/src/ai/acp/ownWrites';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'texpile acp '));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

// an ACP agent over JSON lines: asks before it edits main.tex in its folder, or wants a sign-in first
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
					if (msg.result.outcome.optionId === 'yes') fs.writeFileSync('main.tex', 'new text');
					send({ method: 'session/update', params: { sessionId: 's1', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Done.' } } } });
					send({ id: prompt, result: { stopReason: 'end_turn' } });
				}
			}
		});`
	);
	return file;
}

// `whileAsking` runs as the agent waits on its question, in the middle of the turn
function session(name: string, wantsSignIn: boolean, root: string, events: AcpEvent[], whileAsking = () => {}): AcpSession {
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
			whileAsking();
			s.answer(e.id, 'yes');
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
