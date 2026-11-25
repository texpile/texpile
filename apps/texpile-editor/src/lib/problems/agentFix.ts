// Fix with agent: the problem and its line go to the Agent tab as a message
import { agentSession, openAgentSession } from '$lib/ai/agentPanel/agentSession.svelte';
import { agentUnavailable } from '$lib/ai/agentPanel/agentAvailability';
import { panelTabOff } from '$lib/ai/agentPanel/agentOffer.svelte';
import { textNow } from '$lib/buffers/textNow';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import { relativeInside } from '$lib/workspace/fileSystem';
import { m } from '$lib/paraglide/messages';
import { lineText, linesOf } from './textLines';
import type { Problem } from './problemTypes';

const WAIT_MS = 60_000;

/** AI turned off, the Agent tab turned off, or an agent that cannot run here */
export function agentFixOffered(): boolean {
	return !panelTabOff() && agentUnavailable() === null;
}

function ready(): Promise<boolean> {
	const until = Date.now() + WAIT_MS;
	return new Promise((answer) => {
		function look(): void {
			const s = agentSession.state;
			if (s === 'ready' || s === 'working') return answer(true);
			if ((s !== 'idle' && s !== 'starting') || Date.now() > until) return answer(false);
			setTimeout(look, 200);
		}
		look();
	});
}

/** `showAgent` brings the tab up, where a sign-in or a missing agent says what to do */
export async function fixWithAgent(p: Problem, showAgent: () => void): Promise<void> {
	const root = workspaceRoot.current;
	if (!root || !p.file || !agentFixOffered()) return;
	showAgent();
	await openAgentSession(root);
	if (!(await ready())) return;
	const file = (relativeInside(root, p.file) ?? p.file).replace(/\\/g, '/');
	const text = p.line ? await textNow(p.file).catch(() => null) : null;
	const lines = text !== null && p.line ? { first: p.line, last: p.line, text: lineText(linesOf(text), p.line) } : null;
	const where = p.line ? `${file}:${p.line}` : file;
	await agentSession.send(m.problems_agent_prompt({ where, problem: p.message }), { path: p.file, lines });
}
