// a burst of suggestion events reduced to the lines worth writing
import type { CommentAnchor } from './anchor';
import { anchorEvent, deleteEvent, resolveEvent, type CommentEvent, type CommentThread } from './log';

export function collapseStaged(staged: CommentEvent[]): CommentEvent[] {
	const withdrawn = new Set(staged.flatMap((e) => (e.t === 'delete' ? [e.thread] : [])));
	const bornAndGone = new Set(staged.flatMap((e) => (e.t === 'open' && withdrawn.has(e.id) ? [e.id] : [])));
	const out: (CommentEvent | null)[] = [];
	const opened = new Map<string, number>();
	const lastAnchor = new Map<string, number>();

	for (const e of staged) {
		const id = e.t === 'open' ? e.id : 'thread' in e ? e.thread : null;
		if (id && bornAndGone.has(id)) continue;
		if (e.t === 'open') {
			opened.set(e.id, out.length);
			out.push(e);
			continue;
		}
		if (e.t !== 'anchor') {
			out.push(e);
			continue;
		}
		if (withdrawn.has(e.thread)) continue;
		const at = opened.get(e.thread);
		const open = at === undefined ? null : out[at];
		if (at !== undefined && open?.t === 'open') {
			out[at] = { ...open, anchor: e.anchor, restore: e.restore ?? open.restore, ...(e.file ? { file: e.file } : {}) };
			continue;
		}
		const prev = lastAnchor.get(e.thread);
		const earlier = prev === undefined ? null : out[prev];
		if (prev !== undefined && earlier?.t === 'anchor') out[prev] = null;
		out.push(earlier?.t === 'anchor' ? { ...e, restore: e.restore ?? earlier.restore, file: e.file ?? earlier.file } : e);
		lastAnchor.set(e.thread, out.length - 1);
	}
	return out.filter((e): e is CommentEvent => e !== null);
}

/** puts back what a write of the log took early of typing since thrown away: `before` is each thread that typing
 *  changed as it stood until then, null for one it made */
export function thrownBack(before: Map<string, CommentThread | null>, threads: CommentThread[], by: string): CommentEvent[] {
	const at = new Date().toISOString();
	const out: CommentEvent[] = [];
	for (const [thread, was] of before) {
		const now = threads.find((t) => t.id === thread);
		if (!now) continue;
		if (!was) {
			// someone answered it: closed, so the answer stays readable
			if (now.messages.length <= 1) out.push(deleteEvent({ thread, by, at }));
			else if (!now.resolved) out.push(resolveEvent({ thread, resolved: true, decision: 'closed', by, at }));
			continue;
		}
		if (!sameAnchor(now.anchor, was.anchor) || now.restore !== was.restore)
			out.push(anchorEvent({ thread, anchor: was.anchor, restore: was.restore, by, at }));
		// an Accept changes no words, so throwing the typing away does not take it back
		if (now.decision !== 'accepted' && (now.resolved !== was.resolved || now.decision !== was.decision))
			out.push(resolveEvent({ thread, resolved: was.resolved, decision: was.decision, by, at }));
	}
	return out;
}

function sameAnchor(a: CommentAnchor, b: CommentAnchor): boolean {
	return (
		a.quote === b.quote && a.prefix === b.prefix && a.suffix === b.suffix && a.start === b.start && a.end === b.end && a.rank === b.rank
	);
}
