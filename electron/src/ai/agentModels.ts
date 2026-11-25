// The models Claude Code and Codex offer, asked of the agent itself, so the list matches the reader's plan and version.
// Claude Code answers the handshake its SDK opens with, Codex its app server's model/list. Neither sends a prompt
import type { ChildProcess } from 'node:child_process';
import { shellEnvReady } from '../shell/shellEnv';
import { findProgram } from '../shell/findProgram';
import { killTree } from '../shell/killTree';
import { lastLine, makeRunFolder, removeRunFolder, startAgentProcess } from './agentProcess';

/** id '' is the agent's own default, which passes no --model */
export type AgentModel = { id: string; name: string; description: string };
export type AgentModelList = { ok: true; models: AgentModel[] } | { ok: false; error: string };

type Message = Record<string, unknown> & { id?: unknown; result?: unknown; error?: unknown };
/** what to do with each message the agent prints: write more, or finish with the list or an error */
type Conversation = {
	args: string[];
	opening: object[];
	reply(msg: Message, write: (m: object) => void): AgentModelList | undefined;
};

const TIMEOUT_MS = 30_000;
const MOST_PAGES = 10;

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

function claudeConversation(): Conversation {
	return {
		args: [
			'-p',
			'--input-format',
			'stream-json',
			'--output-format',
			'stream-json',
			'--verbose',
			'--tools',
			'',
			'--strict-mcp-config',
			'--no-session-persistence'
		],
		opening: [{ type: 'control_request', request_id: 'models', request: { subtype: 'initialize' } }],
		reply(msg) {
			const response = msg.type === 'control_response' ? (msg.response as Message | undefined) : undefined;
			if (response?.request_id !== 'models') return;
			if (response.subtype !== 'success') return { ok: false, error: text(response.error) || 'the handshake failed' };
			const models = (response.response as { models?: unknown } | undefined)?.models;
			if (!Array.isArray(models)) return { ok: false, error: 'no models in its answer' };
			return {
				ok: true,
				models: models
					.filter((m) => text(m?.value))
					.map((m) => ({
						id: m.value === 'default' ? '' : m.value,
						name: text(m.displayName) || m.value,
						description: text(m.description)
					}))
			};
		}
	};
}

function codexConversation(version: string): Conversation {
	const models: AgentModel[] = [];
	let page = 0;
	const list = (cursor?: string) => ({
		id: `list${page}`,
		method: 'model/list',
		params: { includeHidden: false, ...(cursor ? { cursor } : {}) }
	});
	return {
		args: ['app-server', '--listen', 'stdio://'],
		opening: [{ id: 'init', method: 'initialize', params: { clientInfo: { name: 'texpile', title: 'Texpile', version } } }],
		reply(msg, write) {
			if (msg.error) return { ok: false, error: text((msg.error as { message?: unknown }).message) || 'the app server refused' };
			if (msg.id === 'init') {
				write({ method: 'initialized' });
				write(list());
				return;
			}
			if (msg.id !== `list${page}`) return;
			const result = msg.result as { data?: unknown; nextCursor?: unknown } | undefined;
			for (const m of Array.isArray(result?.data) ? result.data : []) {
				if (!m?.hidden && text(m?.model))
					models.push({ id: m.model, name: text(m.displayName) || m.model, description: text(m.description) });
			}
			if (text(result?.nextCursor) && ++page < MOST_PAGES) return void write(list(text(result?.nextCursor)));
			return { ok: true, models };
		}
	};
}

/** one run of the agent, reading its JSON lines until the conversation has its answer; version is Texpile's */
export function askModels(command: string[], agent: 'claude' | 'codex', version: string): Promise<AgentModelList> {
	const dir = makeRunFolder();
	const talk = agent === 'claude' ? claudeConversation() : codexConversation(version);
	return new Promise((resolve) => {
		let child: ChildProcess;
		try {
			child = startAgentProcess(command[0], [...command.slice(1), ...talk.args], dir);
		} catch (e) {
			removeRunFolder(dir);
			return resolve({ ok: false, error: e instanceof Error ? e.message : String(e) });
		}
		let done = false;
		let err = '';
		let pending = '';
		function finish(result: AgentModelList): void {
			if (done) return;
			done = true;
			clearTimeout(timer);
			if (child.pid) killTree(child.pid);
			resolve(result);
		}
		const timer = setTimeout(() => finish({ ok: false, error: lastLine(err) ?? `${command[0]} did not answer` }), TIMEOUT_MS);
		const write = (m: object) => void child.stdin?.write(JSON.stringify(m) + '\n');
		child.stdin?.on('error', () => {});
		child.stderr?.setEncoding('utf8').on('data', (d: string) => void (err = (err + d).slice(-4000)));
		child.stdout?.setEncoding('utf8').on('data', (d: string) => {
			pending += d;
			const lines = pending.split('\n');
			pending = lines.pop() ?? '';
			for (const line of lines) {
				let msg: Message;
				try {
					msg = JSON.parse(line);
				} catch {
					continue;
				}
				const answer = talk.reply(msg, write);
				if (answer) return finish(answer);
			}
		});
		child.on('error', (e) => {
			finish({ ok: false, error: e.message });
			removeRunFolder(dir);
		});
		child.on('close', (code) => {
			finish({ ok: false, error: lastLine(err) ?? `${command[0]} exited with code ${code}` });
			removeRunFolder(dir);
		});
		for (const m of talk.opening) write(m);
	});
}

export async function listAgentModels(agent: 'claude' | 'codex', version: string): Promise<AgentModelList> {
	await shellEnvReady();
	const program = findProgram(agent);
	return program ? askModels([program], agent, version) : { ok: false, error: `${agent} was not found on PATH` };
}
