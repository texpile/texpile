// The reader's own agent in main (electron/src/ipc/agentIpc.ts): main picks the program, a request carries the prompt
import type { AiAgent, PresetAgent } from './aiAgents';

export type AgentAnswer = { ok: true; text: string } | { ok: false; error: string; cancelled?: true };

/** id '' is the agent's own default */
export type AgentModel = { id: string; name: string; description: string };
export type AgentModelList = { ok: true; models: AgentModel[] } | { ok: false; error: string };

type AgentBridge = {
	run(id: string, prompt: string, system: string, task?: 'refine' | 'math'): Promise<AgentAnswer>;
	test(): Promise<AgentAnswer>;
	cancel(id: string): void;
	warmMath(system: string): void;
	detect(): Promise<Record<PresetAgent, boolean>>;
	models(agent: AiAgent): Promise<AgentModelList>;
};

export function agentBridge(): AgentBridge | undefined {
	return (globalThis as { texpileAgent?: AgentBridge }).texpileAgent;
}
