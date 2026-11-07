// What changed between two versions of a document, in the NEW document's coordinates.
//
// The docs are diffed, not their sources: a change with no rendered counterpart is then simply not
// a change, where mapping source offsets back had to guess a position for one. Dialect-blind for
// the same reason.
import { ChangeSet, simplifyChanges, type Change } from 'prosemirror-changeset';
import { StepMap } from 'prosemirror-transform';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { changeTokens } from './changeTokens';
import { isSelfRendered } from './selfRendered';
import { sharedWordsGivenBack, type DiffRange } from './sharedWords';

/** keeping the SET, not its changes, is what makes editing in a comparison cheap: addSteps from here */
export function initialChangeSet(oldDoc: PMNode, newDoc: PMNode): ChangeSet {
	const whole = new StepMap([0, oldDoc.content.size, newDoc.content.size]);
	return ChangeSet.create(oldDoc, undefined, changeTokens).addSteps(newDoc, [whole], null);
}

export function docChanges(oldDoc: PMNode, newDoc: PMNode): readonly DiffRange[] {
	if (oldDoc.eq(newDoc)) return [];
	return wholeWordChanges(initialChangeSet(oldDoc, newDoc).changes, oldDoc, newDoc);
}

// edits inside one word read as confetti; simplifyChanges expands them to whole words
function wholeWordChanges(changes: readonly Change[], oldDoc: PMNode, newDoc: PMNode): DiffRange[] {
	return sharedWordsGivenBack(simplifyChanges(changes, newDoc), oldDoc, newDoc);
}

// ProseMirror's decoration types are internal, so the tests need these to tell the marks apart
const INLINE_SPEC = { diff: 'inline' };
const NODE_SPEC = { diff: 'node' };

const WORD = /[\p{L}\p{N}]/u;

// green for arrived, amber for changed - the pair the file tree already uses
const ADDED_NODE = 'texpile-diff-added-node';
const CHANGED_NODE = 'texpile-diff-changed-node';

/** content on both sides is a replacement; on the new side only, it arrived */
function nodeClass(change: DiffRange): string {
	return change.toA > change.fromA ? CHANGED_NODE : ADDED_NODE;
}

/** '' at a node boundary, which is where widening stops */
function charAt(doc: PMNode, pos: number): string {
	return doc.textBetween(pos, pos + 1);
}

// the diff's range is character-minimal, so it can start mid-word - dropping "Two." between One
// and Three splits the shared T. Snap, or the marker renders inside a word.
function markerPos(newDoc: PMNode, at: number): number {
	let pos = at;
	while (pos > 0 && WORD.test(charAt(newDoc, pos - 1)) && WORD.test(charAt(newDoc, pos))) pos--;
	return pos;
}

function survivesNear(newDoc: PMNode, pos: number, word: string): boolean {
	if (!word) return false;
	const from = Math.max(0, pos - word.length);
	const to = Math.min(newDoc.content.size, pos + word.length);
	return newDoc.textBetween(from, to, '\n', ' ').includes(word);
}

/** same problem as the marker's position: "wo.\nT" is a faithful range and not a sentence. Widen
 *  to words, then give back any end word still on screen - claiming text that is still there went
 *  is the worse mistake. */
function removedText(oldDoc: PMNode, newDoc: PMNode, change: DiffRange): string {
	let from = change.fromA;
	let to = change.toA;
	while (from > 0 && WORD.test(charAt(oldDoc, from - 1))) from--;
	while (to < oldDoc.content.size && WORD.test(charAt(oldDoc, to))) to++;

	let text = oldDoc.textBetween(from, to, '\n', ' ').trim();
	const lead = /^\S+/.exec(text)?.[0] ?? '';
	if (from < change.fromA && survivesNear(newDoc, change.fromB, lead)) text = text.slice(lead.length).trim();
	const tail = /\S+$/.exec(text)?.[0] ?? '';
	if (to > change.toA && survivesNear(newDoc, change.toB, tail)) text = text.slice(0, text.length - tail.length).trim();
	return text;
}

// A widget, never a node: three dialects means three schemas and three serializers to teach about
// it, and one missed case writes diff furniture into the author's file.
function removedMarker(text: string, block: boolean): HTMLElement {
	const el = document.createElement(block ? 'div' : 'span');
	el.className = block ? 'texpile-diff-removed-block' : 'texpile-diff-removed';
	el.setAttribute('contenteditable', 'false');
	el.textContent = text;
	el.setAttribute('aria-label', text.length > 400 ? `${text.slice(0, 400)}…` : text);
	return el;
}

export function changeDecorations(oldDoc: PMNode, newDoc: PMNode): DecorationSet {
	return decorationsFor(docChanges(oldDoc, newDoc), oldDoc, newDoc);
}

/** from a set extended by editing; `startDoc` is the version the deleted text is read from */
export function decorationsForSet(set: ChangeSet, newDoc: PMNode): DecorationSet {
	return decorationsFor(wholeWordChanges(set.changes, set.startDoc, newDoc), set.startDoc, newDoc);
}

function decorationsFor(changes: readonly DiffRange[], oldDoc: PMNode, newDoc: PMNode): DecorationSet {
	const decos: Decoration[] = [];
	const marked = new Set<number>();

	/** ProseMirror draws nothing inside a CodeMirror island, a formula or a chip, so an inline
	 *  decoration there has no span to hang a class on. Coarse by necessity: the whole formula. */
	function markSelfRendered(from: number, to: number, cls: string): boolean {
		let inside = false;
		newDoc.nodesBetween(from, to, (node, pos) => {
			if (!isSelfRendered(node)) return true;
			inside = true;
			if (!marked.has(pos)) {
				marked.add(pos);
				decos.push(Decoration.node(pos, pos + node.nodeSize, { class: cls }, NODE_SPEC));
			}
			return false;
		});
		return inside;
	}

	/** a change with no text changed the node itself - a section demoted, a figure repointed - and
	 *  an inline decoration over it would cover no text and paint nothing */
	function markStructural(from: number, to: number, cls: string) {
		newDoc.nodesBetween(from, to, (node, pos) => {
			if (node.isText || pos < from || pos >= to || marked.has(pos)) return true;
			// the hole a deleted file leaves, not content that arrived
			if (node.isTextblock && node.content.size === 0) return true;
			marked.add(pos);
			decos.push(Decoration.node(pos, pos + node.nodeSize, { class: cls }, NODE_SPEC));
			return true;
		});
	}

	for (const change of changes) {
		if (change.toB > change.fromB) {
			const cls = nodeClass(change);
			const inside = markSelfRendered(change.fromB, change.toB, cls);
			const hasText = newDoc.textBetween(change.fromB, change.toB, '', '').trim().length > 0;
			if (hasText) decos.push(Decoration.inline(change.fromB, change.toB, { class: 'texpile-diff-added' }, INLINE_SPEC));
			else if (!inside) markStructural(change.fromB, change.toB, cls);
		}
		if (change.toA > change.fromA) {
			const text = removedText(oldDoc, newDoc, change);
			// pure structure went: an empty marker says less than none
			if (!text.trim()) continue;
			const at = markerPos(newDoc, change.fromB);
			// no widget inside a self-rendering node; its tint reports the deletion instead
			if (markSelfRendered(at, at, CHANGED_NODE)) continue;
			// at a textblock's start means the block BEFORE it went, so the widget goes there
			const $at = newDoc.resolve(at);
			const atBlockStart = $at.parent.isTextblock && at === $at.start() && $at.depth > 0;
			const block = !$at.parent.isTextblock || atBlockStart;
			const pos = atBlockStart ? $at.before() : at;
			decos.push(
				Decoration.widget(pos, () => removedMarker(text, block), {
					side: -1,
					// chrome, not content: a copy out of the diff must not carry it
					ignoreSelection: true,
					key: `del-${change.fromA}`
				})
			);
		}
	}
	return DecorationSet.create(newDoc, decos);
}
