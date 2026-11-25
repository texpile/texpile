// Runs the reader's own agent once: the prompt on stdin, the answer from stdout or the file it was told to write
import type { ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { shellEnvReady } from '../shell/shellEnv';
import { findProgram } from '../shell/findProgram';
import { killTree } from '../shell/killTree';
import { ANSWER_FILE, SYSTEM_FILE } from './agentCommand';
import { lastLine, makeRunFolder, removeRunFolder, startAgentProcess } from './agentProcess';
import { agentStdio, type AgentStdio } from './agentStdio';

export type AgentResult = { ok: true; text: string } | { ok: false; error: string; cancelled?: true };

/** a picture sent with a request, as base64 */
export type PromptImage = { mediaType: string; base64: string };

/** the rules of the task apart from the request itself; an agent with no place for rules gets both as one message */
export type AgentPrompt = { system: string; request: string; images?: PromptImage[] };

const TIMEOUT_MS = 180_000;
const MOST_OUTPUT = 1 << 20;

export async function runAgent(
	argv: string[],
	prompt: AgentPrompt,
	signal: AbortSignal,
	stdio: AgentStdio = agentStdio('')
): Promise<AgentResult> {
	await shellEnvReady();
	const program = findProgram(argv[0]);
	if (!program) return { ok: false, error: `${argv[0]} was not found on PATH` };
	const dir = makeRunFolder();
	const answerFile = argv.includes(ANSWER_FILE) ? path.join(dir, 'answer.txt') : null;
	const takesRules = argv.some((a) => a.includes(SYSTEM_FILE));
	const args = argv.slice(1).map((a) => (a === ANSWER_FILE && answerFile ? answerFile : a.replaceAll(SYSTEM_FILE, 'system.txt')));
	const message = takesRules || !prompt.system ? prompt.request : `${prompt.system}\n\n${prompt.request}`;
	return new Promise((resolve) => {
		let child: ChildProcess;
		try {
			if (takesRules) fs.writeFileSync(path.join(dir, 'system.txt'), prompt.system, 'utf8');
			child = startAgentProcess(program, args, dir);
		} catch (e) {
			removeRunFolder(dir);
			return resolve({ ok: false, error: e instanceof Error ? e.message : String(e) });
		}
		let out = '';
		let err = '';
		let ended: AgentResult | null = null;
		function stop(result: AgentResult): void {
			ended = result;
			if (child.pid) killTree(child.pid);
		}
		// the last thing it printed says why, such as a sign-in it is waiting for
		const timer = setTimeout(() => {
			const said = lastLine(err) ?? lastLine(out);
			stop({
				ok: false,
				error: `${argv[0]} did not answer within ${TIMEOUT_MS / 60_000} minutes${said ? `. Its last words: ${said}` : ''}`
			});
		}, TIMEOUT_MS);
		function onAbort(): void {
			stop({ ok: false, error: 'cancelled', cancelled: true });
		}
		signal.addEventListener('abort', onAbort, { once: true });
		child.stdout?.setEncoding('utf8').on('data', (d: string) => {
			if (out.length < MOST_OUTPUT) out += d;
		});
		child.stderr?.setEncoding('utf8').on('data', (d: string) => {
			if (err.length < MOST_OUTPUT) err += d;
		});
		child.stdin?.on('error', () => {});
		child.stdin?.end(stdio.toStdin(message), 'utf8');
		function finish(result: AgentResult): void {
			clearTimeout(timer);
			signal.removeEventListener('abort', onAbort);
			removeRunFolder(dir);
			resolve(result);
		}
		child.on('error', (e) => finish({ ok: false, error: e.message }));
		child.on('close', (code) => {
			if (ended) return finish(ended);
			if (code !== 0) return finish({ ok: false, error: lastLine(err) ?? `${argv[0]} exited with code ${code}` });
			let text = stdio.fromStdout(out);
			if (answerFile) {
				try {
					text = fs.readFileSync(answerFile, 'utf8');
				} catch {
					/* no file written: stdout is all there is */
				}
			}
			finish(text.trim() ? { ok: true, text } : { ok: false, error: lastLine(err) ?? `${argv[0]} gave no answer` });
		});
	});
}
