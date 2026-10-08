// the session's comment log as a list in the shared doc, read in one order by every side
import type * as Y from 'yjs';
import type { CommentLogShare } from '$lib/comments/store.svelte';
import type { CommentsController } from '$lib/workspace/commentsController.svelte';
import { isSafeCommentEvent } from './protocol';
import { isShared } from './sharedFiles';

export function commentLogOf(doc: Y.Doc): Y.Array<string> {
	return doc.getArray<string>('comments');
}

/** a guest's line the host keeps: an event it can read, about a file the session shares */
function hostKeeps(line: unknown): boolean {
	if (typeof line !== 'string') return false;
	let event: unknown;
	try {
		event = JSON.parse(line);
	} catch {
		return false;
	}
	return isSafeCommentEvent(event) && (event.t !== 'open' || isShared(event.file));
}

/** `changed` hears what someone else did to the log: the lines they added, and whether any went */
export function shareCommentLog(
	log: Y.Array<string>,
	role: 'host' | 'guest',
	changed: (added: string[], dropped: boolean) => void
): CommentLogShare & { stop(): void } {
	const doc = log.doc!;
	function lines(): string[] {
		return log.toArray().filter((line) => typeof line === 'string');
	}

	function edit(changes: [unknown, string | null][], add: string[]): void {
		if (changes.length === 0 && add.length === 0) return;
		doc.transact(() => {
			const left = new Map<unknown, (string | null)[]>();
			for (const [line, next] of changes) left.set(line, [...(left.get(line) ?? []), next]);
			const all = log.toArray();
			for (let i = all.length - 1; i >= 0 && left.size > 0; i--) {
				const queue = left.get(all[i]);
				if (!queue) continue;
				const next = queue.shift();
				if (queue.length === 0) left.delete(all[i]);
				log.delete(i, 1);
				if (typeof next === 'string') log.insert(i, [next]);
			}
			if (add.length) log.push(add);
		});
	}

	function observer(event: Y.YArrayEvent<string>, tr: Y.Transaction): void {
		if (tr.local) return;
		let added: string[] = [];
		let dropped = false;
		for (const d of event.changes.delta) {
			if (d.insert) added.push(...(d.insert as string[]));
			if (d.delete) dropped = true;
		}
		// the host is the one who writes the file, so what it will not write, nobody keeps
		if (role === 'host') {
			const refused = added.filter((line) => !hostKeeps(line));
			if (refused.length) {
				edit(
					refused.map((line) => [line, null]),
					[]
				);
				added = added.filter((line) => hostKeeps(line));
			}
		}
		if (added.length || dropped) changed(added, dropped);
	}
	log.observe(observer);
	return { lines, edit, stop: () => log.unobserve(observer) };
}

/** a workspace's comments following the session's log until the returned stop */
export function shareComments(ctl: CommentsController, log: Y.Array<string>, role: 'host' | 'guest'): () => void {
	const share = shareCommentLog(log, role, (added, dropped) => ctl.received(added, dropped));
	ctl.startSharing(share, role === 'host');
	return () => {
		share.stop();
		ctl.stopSharing();
	};
}
