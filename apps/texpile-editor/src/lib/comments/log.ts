// The on-disk shape of review comments: an append-only event log, one JSON object per line.
//
// Why a log rather than a JSON array of threads. This file is meant to be committed - comments are
// for other people, which is the whole reason they live in the project rather than in localStorage
// beside the compile command. So git has to merge it, and git merges lines. A JSON array reindents
// on every insertion and conflicts whenever two people comment anywhere in the document; a log
// where every action is its own line merges by concatenation and essentially cannot conflict, even
// when two people reply to the same thread at once.
//
// The cost is that the file only grows, and that reading it means folding it. Both are cheap at
// review scale, and compaction is a rewrite of the folded state whenever it gets long.
import type { CommentAnchor } from './anchor';

/** bumped only for a change that an older build could not read; parseLog drops anything higher */
export const LOG_VERSION = 1;

type Base = {
	v: number;
	at: string;
	by: string;
};

export type CommentEvent =
	| (Base & { t: 'open'; id: string; file: string; body: string; anchor: CommentAnchor })
	| (Base & { t: 'reply'; id: string; thread: string; body: string })
	| (Base & { t: 'resolve'; thread: string; resolved: boolean })
	| (Base & { t: 'delete'; thread: string })
	// one message rather than the whole thread. The log is a file anyone can open in an editor, so
	// withholding these from the UI would only mean the fastest way to fix a typo is Notepad.
	| (Base & { t: 'edit'; message: string; body: string })
	| (Base & { t: 'delete-message'; message: string })
	// a file (or directory) was renamed/moved in the tree, and its threads went with it. Paths are
	// workspace-relative like thread.file. Same version on purpose: an older build's isEvent skips
	// the unknown t, so it degrades to threads staying under the old path rather than breaking.
	| (Base & { t: 'move'; from: string; to: string })
	// the thread re-pinned to other text, after an edit rewrote the quote it sat on (an agent acting
	// on the comment, mostly). `file` only when it also changed. Same version, same degrade story as
	// move: an older build keeps the old anchor and shows the thread detached.
	| (Base & { t: 'anchor'; thread: string; anchor: CommentAnchor; file?: string })
	// The last thing a Texpile instance SAW when it looked for this thread's text. Unlike every other
	// event here it records an observation rather than a decision, and it is written only when the
	// answer changed - so browsing a project appends nothing, and the file stays quiet in git.
	//
	// Best-effort by construction, and that is the deal: it is only true while every editor touching
	// these files is Texpile. Edit main.tex in vim and this says whatever it said before, until some
	// Texpile opens the file and corrects it. The panel treats it as a hint for files it has not
	// looked at itself and lets the live verdict override it for the file that is open.
	| (Base & { t: 'place'; thread: string; detached?: boolean; hidden?: boolean });

export type CommentMessage = {
	id: string;
	at: string;
	by: string;
	body: string;
	/** when it was last rewritten, so the reader can tell these words are not the original ones */
	editedAt?: string;
};

export type CommentThread = {
	id: string;
	/** workspace-relative, posix separators, so the file travels between machines */
	file: string;
	anchor: CommentAnchor;
	resolved: boolean;
	messages: CommentMessage[];
	/**
	 * The last recorded observation of whether this thread's text could still be found (`detached`)
	 * and whether the visual editor could draw it (`hidden`). Undefined means nobody has looked yet.
	 *
	 * A cached ANSWER, not a fact about the thread: the anchor changes only by an `anchor` event, but
	 * the file it points at changes freely. See the `place` event for why that is acceptable and what
	 * it costs.
	 */
	detached?: boolean;
	hidden?: boolean;
};

/**
 * Parse the log, skipping anything unreadable.
 *
 * Skipping rather than throwing is deliberate: this file is merged by git, and one conflict marker
 * or half-written line must not take every comment in the project with it.
 */
export function parseLog(text: string): CommentEvent[] {
	const out: CommentEvent[] = [];
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			continue;
		}
		if (isEvent(parsed)) out.push(parsed);
	}
	return out;
}

export function serializeLog(events: CommentEvent[]): string {
	return events.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

/**
 * Fold the log into threads, in the order they were opened.
 *
 * Events naming a thread that is not here are dropped rather than buffered: a bad merge can lose
 * an `open` line while keeping its replies, and a reply with nothing to attach to is not
 * recoverable - inventing a thread for it would put someone's words under a quote they never read.
 */
export function foldLog(events: CommentEvent[]): CommentThread[] {
	const byId = new Map<string, CommentThread>();
	const deleted = new Set<string>();
	// message id -> the thread holding it, so an edit does not have to search every thread
	const owner = new Map<string, CommentThread>();

	for (const e of events) {
		if (e.t === 'open') {
			// a duplicated open (the same line merged twice) must not reset the thread under it
			if (byId.has(e.id)) continue;
			const thread: CommentThread = {
				id: e.id,
				file: e.file,
				anchor: e.anchor,
				resolved: false,
				messages: [{ id: e.id, at: e.at, by: e.by, body: e.body }]
			};
			byId.set(e.id, thread);
			owner.set(e.id, thread);
			continue;
		}

		if (e.t === 'move') {
			// applies to the threads that exist at this point in the log, which is what makes it safe
			// against a file later reappearing under the old name: threads opened on it afterwards are
			// untouched by this earlier move
			for (const thread of byId.values()) {
				if (thread.file === e.from) thread.file = e.to;
				else if (thread.file.startsWith(e.from + '/')) thread.file = e.to + thread.file.slice(e.from.length);
			}
			continue;
		}

		if (e.t === 'edit' || e.t === 'delete-message') {
			const thread = owner.get(e.message);
			if (!thread) continue;
			if (e.t === 'edit') {
				const msg = thread.messages.find((m) => m.id === e.message);
				if (msg) {
					msg.body = e.body;
					msg.editedAt = e.at;
				}
			} else {
				thread.messages = thread.messages.filter((m) => m.id !== e.message);
				owner.delete(e.message);
				// a thread is its conversation; delete the last of it and there is nothing left to
				// show but a quote nobody said anything about
				if (thread.messages.length === 0) deleted.add(thread.id);
			}
			continue;
		}

		const thread = byId.get(e.thread);
		if (!thread) continue;
		if (e.t === 'reply') {
			if (!thread.messages.some((m) => m.id === e.id)) {
				thread.messages.push({ id: e.id, at: e.at, by: e.by, body: e.body });
				owner.set(e.id, thread);
			}
		} else if (e.t === 'resolve') {
			thread.resolved = e.resolved;
		} else if (e.t === 'place') {
			// each field independently, because the two are observed by different halves of the app:
			// source placement by the controller, visual placement by the editor that rendered it. A
			// `place` carrying only one of them must not erase the other's last answer.
			if (e.detached !== undefined) thread.detached = e.detached;
			if (e.hidden !== undefined) thread.hidden = e.hidden;
		} else if (e.t === 'anchor') {
			thread.anchor = e.anchor;
			if (e.file) thread.file = e.file;
			// whatever was observed was observed about the old anchor
			thread.detached = undefined;
			thread.hidden = undefined;
		} else {
			deleted.add(e.thread);
		}
	}
	return [...byId.values()].filter((t) => !deleted.has(t.id));
}

export function openEvent(o: { id: string; file: string; by: string; body: string; anchor: CommentAnchor; at: string }): CommentEvent {
	return {
		v: LOG_VERSION,
		t: 'open',
		...o
	};
}

export function replyEvent(o: { id: string; thread: string; by: string; body: string; at: string }): CommentEvent {
	return {
		v: LOG_VERSION,
		t: 'reply',
		...o
	};
}

export function resolveEvent(o: { thread: string; by: string; resolved: boolean; at: string }): CommentEvent {
	return {
		v: LOG_VERSION,
		t: 'resolve',
		...o
	};
}

export function deleteEvent(o: { thread: string; by: string; at: string }): CommentEvent {
	return { v: LOG_VERSION, t: 'delete', ...o };
}

export function placeEvent(o: { thread: string; by: string; at: string; detached?: boolean; hidden?: boolean }): CommentEvent {
	return {
		v: LOG_VERSION,
		t: 'place',
		...o
	};
}

export function editEvent(o: { message: string; body: string; by: string; at: string }): CommentEvent {
	return {
		v: LOG_VERSION,
		t: 'edit',
		...o
	};
}

export function deleteMessageEvent(o: { message: string; by: string; at: string }): CommentEvent {
	return {
		v: LOG_VERSION,
		t: 'delete-message',
		...o
	};
}

export function moveEvent(o: { from: string; to: string; by: string; at: string }): CommentEvent {
	return {
		v: LOG_VERSION,
		t: 'move',
		...o
	};
}

export function anchorEvent(o: { thread: string; anchor: CommentAnchor; file?: string; by: string; at: string }): CommentEvent {
	return {
		v: LOG_VERSION,
		t: 'anchor',
		...o
	};
}

function isEvent(x: unknown): x is CommentEvent {
	if (typeof x !== 'object' || x === null) return false;
	const e = x as Partial<CommentEvent> & { anchor?: unknown };
	if (typeof e.v !== 'number' || e.v > LOG_VERSION) return false;
	if (typeof e.at !== 'string' || typeof e.by !== 'string') return false;
	switch (e.t) {
		case 'open':
			return typeof e.id === 'string' && typeof e.file === 'string' && typeof e.body === 'string' && isAnchor(e.anchor);
		case 'reply':
			return typeof e.id === 'string' && typeof e.thread === 'string' && typeof e.body === 'string';
		case 'resolve':
			return typeof e.thread === 'string' && typeof e.resolved === 'boolean';
		case 'delete':
			return typeof e.thread === 'string';
		case 'place':
			// both flags optional, but a present one must be a boolean: a half-written merge should
			// lose the observation, not fold a string into a field the panel treats as a verdict
			return (
				typeof e.thread === 'string' &&
				(e.detached === undefined || typeof e.detached === 'boolean') &&
				(e.hidden === undefined || typeof e.hidden === 'boolean')
			);
		case 'edit':
			return typeof e.message === 'string' && typeof e.body === 'string';
		case 'delete-message':
			return typeof e.message === 'string';
		case 'move':
			return typeof (e as { from?: unknown }).from === 'string' && typeof (e as { to?: unknown }).to === 'string';
		case 'anchor':
			return typeof e.thread === 'string' && isAnchor(e.anchor) && (e.file === undefined || typeof e.file === 'string');
		default:
			return false;
	}
}

function isAnchor(x: unknown): x is CommentAnchor {
	if (typeof x !== 'object' || x === null) return false;
	const a = x as Partial<CommentAnchor>;
	return (
		typeof a.quote === 'string' &&
		typeof a.prefix === 'string' &&
		typeof a.suffix === 'string' &&
		typeof a.start === 'number' &&
		typeof a.end === 'number'
	);
}
