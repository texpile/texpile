// The models an agent offers, asked of it once per agent while the app runs; a failed ask is asked again
import { settings } from '$lib/settings';
import { agentBridge, type AgentModel, type AgentModelList } from './agentBridge';
import type { AiAgent } from './aiAgents';

const asked = new Map<string, Promise<AgentModelList>>();

export function agentModels(agent: AiAgent): Promise<AgentModelList> {
	// a custom agent is whatever its command runs
	const key = agent === 'custom' ? `custom\0${settings.current.agentCommand}` : agent;
	const known = asked.get(key);
	if (known) return known;
	const bridge = agentBridge();
	const list: Promise<AgentModelList> = bridge
		? bridge.models(agent).catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }))
		: Promise.resolve({ ok: false, error: 'not in the desktop app' });
	asked.set(key, list);
	void list.then((l) => !l.ok && asked.delete(key));
	return list;
}

/** Default first where the agent lists none of its own, and a saved model it no longer lists kept in view */
export function modelChoices(models: AgentModel[], chosen: string, defaultName: string): AgentModel[] {
	const out = models.some((m) => m.id === '') ? [...models] : [{ id: '', name: defaultName, description: '' }, ...models];
	if (!out.some((m) => m.id === chosen)) out.push({ id: chosen, name: chosen, description: '' });
	return out;
}
