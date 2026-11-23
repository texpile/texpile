// lines above an edit stay while the caret stays in the paragraph, so words on lines not touched never move
import type { Node as PMNode } from 'prosemirror-model';
import { NodeSelection, type EditorState } from 'prosemirror-state';
import { wordBeingTypedKey, type TypedWord } from '../linebreak/wordBeingTyped';
import { isHeldBlock } from './breakProfiles';
import type { BreakSite } from './inlineItems';

/** the breaks a textblock was given, at the width it was given them */
export type ChosenBreaks = { readonly sites: readonly BreakSite[]; readonly width: number };
/** breaks a paragraph had before an edit, good as far as its text is unchanged (an offset like the sites') */
export type KeptLines = { readonly sites: readonly BreakSite[]; readonly unchangedTo: number; readonly width: number };

/** one per view: the view calls update after each transaction and hands it to the layout with each block */
export class KeptBreaks {
	/** the word the caret is typing in, document positions; the patterns leave it whole */
	wholeWord: TypedWord | null = null;
	/** an input method's preedit, document positions; no line ends inside it */
	composition: { from: number; to: number } | null = null;
	private chosen = new WeakMap<PMNode, ChosenBreaks>();
	private pending = new WeakMap<PMNode, KeptLines>();
	// broken with kept lines, so not yet the breaks the whole paragraph would get
	private unsettled = new WeakSet<PMNode>();

	/** the textblocks this update leaves to be broken again, on top of those whose text changed */
	update(before: EditorState, state: EditorState): PMNode[] {
		this.wholeWord = wordBeingTypedKey.getState(state) ?? null;
		const again: PMNode[] = [];
		const left = before.selection.$head.parent;
		const { $head } = state.selection;
		const paragraph = $head.parent;
		const typed = wordBeingTypedKey.getState(before) ?? null;
		// a word held whole there is as unfinished as kept lines are
		if (left !== paragraph && (this.unsettled.has(left) || this.pending.has(left) || typed)) {
			this.pending.delete(left);
			again.push(left);
		}
		// a selected node that changed (a formula's undo) is no typing in the paragraph's words: its lines are made anew
		if (!isHeldBlock(paragraph) || state.selection instanceof NodeSelection) return again;
		const pos = $head.before();
		const released = typed !== null && typed.from !== this.wholeWord?.from;
		// a finished word may now split, and its first half belongs on the line above: that one line is open again
		const beforeWord = released && typed.from > pos && typed.from < pos + paragraph.nodeSize ? typed.from - pos - 1 : Infinity;

		if (before.doc === state.doc) {
			const earlier = released && left === paragraph ? this.earlierBreaks(paragraph) : undefined;
			if (earlier) {
				this.pending.set(paragraph, { ...earlier, unchangedTo: Math.min(earlier.unchangedTo, beforeWord) });
				again.push(paragraph);
			}
			return again;
		}
		if (this.chosen.has(paragraph)) return again;
		const old = pos < before.doc.content.size ? before.doc.nodeAt(pos) : null;
		if (!old || !old.sameMarkup(paragraph)) return again;
		const earlier = this.earlierBreaks(old);
		const changedAt = old.content.findDiffStart(paragraph.content);
		if (earlier && changedAt !== null)
			this.pending.set(paragraph, { ...earlier, unchangedTo: Math.min(earlier.unchangedTo, changedAt + 1, beforeWord) });
		return again;
	}

	/** kept lines wait for this paragraph: its next lines are made, never reused */
	holds(paragraph: PMNode): boolean {
		return this.pending.has(paragraph);
	}

	/** the breaks to keep each time this paragraph is broken while the caret stays in it */
	take(paragraph: PMNode): KeptLines | undefined {
		const kept = this.pending.get(paragraph);
		if (kept) this.unsettled.add(paragraph);
		else this.unsettled.delete(paragraph);
		return kept;
	}

	record(paragraph: PMNode, chosen: ChosenBreaks): void {
		this.chosen.set(paragraph, chosen);
	}

	forget(): void {
		this.chosen = new WeakMap();
		this.pending = new WeakMap();
		this.unsettled = new WeakSet();
	}

	// a paragraph that changed twice before it was broken (a composition) carries its kept breaks along
	private earlierBreaks(paragraph: PMNode): KeptLines | undefined {
		const chosen = this.chosen.get(paragraph);
		return chosen ? { ...chosen, unchangedTo: Infinity } : this.pending.get(paragraph);
	}
}
