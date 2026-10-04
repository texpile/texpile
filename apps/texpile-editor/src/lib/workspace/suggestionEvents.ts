// the comment log events a comparison stands for
import { resolveExactly } from '$lib/comments/anchorSearch';
import { anchorEvent, deleteEvent, openEvent, resolveEvent, type CommentEvent, type CommentThread } from '$lib/comments/log';
import { spotRanks } from '$lib/comments/suggest';
import type { ComparedSuggestions, PlacedSuggestion } from '$lib/comments/suggestCompare';
import { anchorOf } from './suggestionStates';

export function changeEvents(
	file: string,
	text: string,
	r: ComparedSuggestions,
	by: string,
	note: string,
	threads: CommentThread[]
): CommentEvent[] {
	const at = new Date().toISOString();
	const placed = new Map(r.placed.map((s) => [s.id, s]));
	const ranks = spotRanks(r.placed);
	const out: CommentEvent[] = [];
	for (const c of r.changes) {
		const s = placed.get(c.id);
		if (c.t === 'open' && s) {
			const body = s.author === by ? note : '';
			out.push(openEvent({ id: s.id, file, by: s.author, body, anchor: anchorOf(text, s, ranks), at, restore: s.restore }));
		} else if (c.t === 'revise' && s) {
			out.push(anchorEvent({ thread: s.id, anchor: anchorOf(text, s, ranks), restore: s.restore, by, at }));
		} else if (c.t === 'close') {
			out.push(resolveEvent({ thread: c.id, resolved: true, decision: 'closed', by, at }));
		} else if (c.t === 'withdraw') {
			const answered = (threads.find((x) => x.id === c.id)?.messages.length ?? 0) > 1;
			out.push(
				answered ? resolveEvent({ thread: c.id, resolved: true, decision: 'closed', by, at }) : deleteEvent({ thread: c.id, by, at })
			);
		}
	}
	return out;
}

export function movedAnchorEvents(text: string, placed: PlacedSuggestion[], threads: CommentThread[], by: string): CommentEvent[] {
	const at = new Date().toISOString();
	const recorded = new Map(threads.map((t) => [t.id, t]));
	const ranks = spotRanks(placed);
	const moved: CommentEvent[] = [];
	for (const s of placed) {
		const was = recorded.get(s.id)?.anchor;
		const now = anchorOf(text, s, ranks);
		// by where the recorded anchor lands: another copy of its words can sit nearer its old offset
		const found = was && resolveExactly(text, was);
		if (was && (!found || found.from !== s.from || found.to !== s.to || was.rank !== now.rank)) {
			moved.push(anchorEvent({ thread: s.id, anchor: now, by, at }));
		}
	}
	return moved;
}
