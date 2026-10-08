// the shared doc as this side's visual editor last took it in. That editor takes a collaborator's
// change in only when a re-parse lands, so writing its text over the shared one erased whatever was
// still on the way; its change is made here instead and Yjs merges it with theirs
import * as Y from 'yjs';
import { spliceDiff } from './spliceDiff';

// updates held for a copy that is not asked for; past this the older half is taken in
const HELD = 2000;

type HeldUpdate = { update: Uint8Array; touched: Set<unknown> };

export class LocalFork {
	private readonly copy = new Y.Doc();
	// the shared doc's updates since the copy's state, oldest first
	private held: HeldUpdate[] = [];
	private readonly onUpdate = (update: Uint8Array, _origin: unknown, _doc: Y.Doc, tr: Y.Transaction) => {
		this.held.push({ update, touched: new Set(tr.changed.keys()) });
		if (this.held.length > HELD) this.takeIn(this.held.length / 2);
	};

	constructor(private readonly shared: Y.Doc) {
		Y.applyUpdate(this.copy, Y.encodeStateAsUpdate(shared));
		shared.on('update', this.onUpdate);
	}

	destroy(): void {
		this.shared.off('update', this.onUpdate);
	}

	/** carry the editor's change from `before` to `content` into `text`; with no `before` it goes in whole */
	fold(text: Y.Text, content: string, before: string | undefined, origin: unknown): void {
		const now = text.toString();
		if (content === now) return this.takeIn(this.held.length);
		// the copy can read this text off words since deleted and retyped, so a caught up editor edits the live ones
		const caughtUp = before === now;
		if (caughtUp) this.takeIn(this.held.length);
		const mine = before === undefined || caughtUp ? null : this.reading(text, before);
		const change = spliceDiff(mine ? before! : now, content);
		if (!change) return;
		if (!mine) {
			this.shared.transact(() => splice(text, change), origin);
			return;
		}
		let update: Uint8Array | null = null;
		function keep(u: Uint8Array) {
			update = u;
		}
		this.copy.on('update', keep);
		this.copy.transact(() => splice(mine, change));
		this.copy.off('update', keep);
		if (update) Y.applyUpdate(this.shared, update, origin);
	}

	// the copy's side of `text`, moved on through the held updates until it reads `before`; null when it
	// never does (the editor holds text the shared doc never had, a file reloaded from disk)
	private reading(text: Y.Text, before: string): Y.Text | null {
		const name = [...this.shared.share].find(([, t]) => (t as unknown) === text)?.[0];
		if (name === undefined) return null;
		const mine = this.copy.getText(name);
		let reads = mine.toString() === before;
		while (!reads && this.held.length) {
			const next = this.held.shift()!;
			Y.applyUpdate(this.copy, next.update);
			if (next.touched.has(text)) reads = mine.toString() === before;
		}
		return reads ? mine : null;
	}

	private takeIn(n: number): void {
		for (const next of this.held.splice(0, n)) Y.applyUpdate(this.copy, next.update);
	}
}

export function splice(t: Y.Text, change: { index: number; remove: number; insert: string }): void {
	if (change.remove > 0) t.delete(change.index, change.remove);
	if (change.insert) t.insert(change.index, change.insert);
}
