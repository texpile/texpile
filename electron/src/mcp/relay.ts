// A tool's request to the renderer, with the answer passed through whole, refusal and all
import type { BrowserWindow } from 'electron';
import { askRenderer } from './bridge';
import { fail, ok, refused } from './toolReply';

/** the window a tool acts on; root picks one when several are open */
export type TargetWindow = (root?: string) => { win: BrowserWindow; ownAgent?: boolean } | null;
type Answer = { ok?: boolean; reason?: string } | null;

export function relayer(target: TargetWindow) {
	return async (root: string | undefined, kind: string, args: Record<string, unknown>, timeoutMs?: number) => {
		const t = target(root);
		if (!t) return fail('no matching Texpile window');
		const r = (await askRenderer(t.win, kind, t.ownAgent ? { ...args, ownAgent: true } : args, timeoutMs)) as Answer;
		if (r === null) return fail('the editor did not respond in time');
		if (!r.ok) return refused(r);
		return ok(r);
	};
}
