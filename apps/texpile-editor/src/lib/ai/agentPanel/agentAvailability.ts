// where the Agent tab cannot work, which it says rather than hiding: the agent is a program on the computer whose
// folder is open, and Texpile Desktop starts it
import { acpBridge } from './acpBridge';
import { GUEST_ROOT } from '$lib/collab/sessionProvider';
import { fileMode } from '$lib/workspace/fileMode.svelte';
import { workspaceRoot } from '$lib/workspace/workspaceStore';

/** a guest in a shared session; the browser; a lone file, whose folder may be Downloads or home */
export type AgentUnavailable = 'host' | 'desktop' | 'folder';

export function agentUnavailable(): AgentUnavailable | null {
	if (workspaceRoot.current === GUEST_ROOT) return 'host';
	if (!acpBridge()) return 'desktop';
	if (fileMode.current) return 'folder';
	return null;
}
