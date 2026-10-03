// which preset agents are on this computer, looked up once per window and again where the reader picks one
import { acpBridge } from './acpBridge';

let found = $state<Record<string, boolean> | null>(null);

export const installedAgents = {
	get found(): Record<string, boolean> | null {
		return found;
	}
};

/** `again` for Preferences, where an agent may just have been installed */
export function lookUpAgents(again = false): void {
	if (found && !again) return;
	void acpBridge()
		?.detect()
		.then((r) => (found = r))
		.catch(() => undefined);
}
