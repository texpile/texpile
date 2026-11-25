// A request to the agent picked in Preferences › AI agent
import { chosenAgent } from './agentChoice';
import { askAgent, type AgentTask } from './warm/warmAgents';
import type { AgentPrompt, AgentResult } from './agentPrompt';

export function askAi(task: AgentTask, s: Record<string, unknown>, prompt: AgentPrompt, signal: AbortSignal): Promise<AgentResult> {
	const agent = chosenAgent(s);
	if (!agent) return Promise.resolve({ ok: false, error: 'No AI agent is picked in Preferences.' });
	return askAgent(task, agent, s, prompt, signal);
}
