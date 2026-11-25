// An agent's process kept between requests, in a folder of its own, and how a request to it is stopped
import type { ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { killTree } from '../../shell/killTree';
import { lastLine, makeRunFolder, removeRunFolder, startAgentProcess } from '../agentProcess';
import type { AgentPrompt, AgentResult } from '../agentPrompt';

export type WarmAgent = {
	/** false once it has ended or is ending */
	readonly alive: boolean;
	/** a model the process was not started with goes with the request, where the agent takes one there */
	ask(prompt: AgentPrompt, signal: AbortSignal, model: string): Promise<AgentResult>;
	close(): void;
};

export type HeldProcess = {
	child: ChildProcess;
	dir: string;
	/** why it ended, once it has */
	readonly exitError: string | null;
	readonly alive: boolean;
	lastWords(): string | undefined;
	close(): void;
};

const TIMEOUT_MS = 180_000;

/** `kept` is a folder of Texpile's own to run in, left in place at exit, in place of a new empty one */
export type HeldPlace = { kept?: string; env?: Record<string, string> };

export function startHeldProcess(
	program: string,
	args: string[],
	files: Record<string, string>,
	onExit: (error: string) => void,
	place: HeldPlace = {}
): HeldProcess {
	const name = path.basename(program).replace(/\.(exe|cmd|bat)$/i, '');
	const dir = place.kept ?? makeRunFolder();
	function removeDir(): void {
		if (!place.kept) removeRunFolder(dir);
	}
	let child: ChildProcess;
	try {
		for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), text, 'utf8');
		child = startAgentProcess(program, args, dir, place.env);
	} catch (e) {
		removeDir();
		throw e;
	}
	let stderr = '';
	let exitError: string | null = null;
	let closing = false;
	child.stderr?.setEncoding('utf8').on('data', (d: string) => void (stderr = (stderr + d).slice(-8000)));
	child.stdin?.on('error', () => {});
	function exited(error: string): void {
		if (exitError !== null) return;
		exitError = error;
		removeDir();
		onExit(error);
	}
	child.on('error', (e) => exited(e.message));
	child.on('close', (code) => exited(lastLine(stderr) ?? `${name} exited with code ${code}`));
	return {
		child,
		dir,
		get exitError() {
			return exitError;
		},
		get alive() {
			return !closing && exitError === null;
		},
		lastWords: () => lastLine(stderr),
		close() {
			if (!this.alive) return;
			closing = true;
			if (child.pid) killTree(child.pid);
		}
	};
}

/** resolves when the request is cancelled or runs out of time; end() lets go of both */
export function watchStop(
	signal: AbortSignal,
	name: string,
	lastWords: () => string | undefined
): { stopped: Promise<AgentResult>; end(): void } {
	let timer: NodeJS.Timeout | undefined;
	let onAbort = (): void => {};
	const stopped = new Promise<AgentResult>((resolve) => {
		timer = setTimeout(() => {
			const said = lastWords();
			resolve({
				ok: false,
				error: `${name} did not answer within ${TIMEOUT_MS / 60_000} minutes${said ? `. Its last words: ${said}` : ''}`
			});
		}, TIMEOUT_MS);
		onAbort = () => resolve({ ok: false, error: 'cancelled', cancelled: true });
	});
	if (signal.aborted) onAbort();
	signal.addEventListener('abort', onAbort, { once: true });
	return {
		stopped,
		end() {
			clearTimeout(timer);
			signal.removeEventListener('abort', onAbort);
		}
	};
}
