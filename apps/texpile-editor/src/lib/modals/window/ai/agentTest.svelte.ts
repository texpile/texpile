// Test agent: one short request the way the AI features send theirs, and how long the answer took
import { agentBridge } from '$lib/ai/agent/agentBridge';
import type { AiAgent } from '$lib/ai/agent/aiAgents';

export type AgentTestState =
	| { agent: AiAgent; phase: 'running' }
	| { agent: AiAgent; phase: 'passed'; seconds: string }
	| { agent: AiAgent; phase: 'failed'; error: string };

class AgentTest {
	current = $state<AgentTestState | null>(null);

	async run(agent: AiAgent): Promise<void> {
		const bridge = agentBridge();
		if (!bridge || this.current?.phase === 'running') return;
		this.current = { agent, phase: 'running' };
		const start = performance.now();
		const answer = await bridge.test().catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
		const seconds = ((performance.now() - start) / 1000).toFixed(1);
		this.current = answer.ok ? { agent, phase: 'passed', seconds } : { agent, phase: 'failed', error: answer.error };
	}
}

export const agentTest = new AgentTest();
