// Each file as it was before a turn changed it, for the diff view's comparison and for Revert. In memory
// for the window's life: Texpile does not write copies of a writer's files to disk behind their back
import type { ChangedFile, TurnChange } from '../agentPanel.types';

export const AGENT_REF = 'agent:';

let before = new Map<string, string>();
let turn = 0;

export function keepBefore(changes: TurnChange[]): ChangedFile[] {
	turn += 1;
	const next = new Map(before);
	const files = changes.map((c): ChangedFile => {
		if (c.before === null) return { path: c.path, change: c.kind, ref: null };
		const ref = `${AGENT_REF}${turn}:${c.path}`;
		next.set(ref, c.before);
		return { path: c.path, change: c.kind, ref };
	});
	before = next;
	return files;
}

export function readBefore(ref: string): string | null {
	return before.get(ref) ?? null;
}
