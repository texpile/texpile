// Review comments in the visual editor: the highlight under commented text, and the click that
// selects a thread. The ProseMirror counterpart of extensions/comments.ts, deliberately smaller -
// the panel, the log and the anchors are all shared, so this file is only "turn threads into
// decorations for THIS representation".
//
// A thread is a range of the FILE, resolved once by the controller; here it is a lookup through the
// document's source map, both ways: a placed thread is its bytes' characters, a selection to
// comment on is its characters' bytes.
//
// Once placed, ranges are MAPPED through every transaction rather than looked up again (the same
// discipline as the CodeMirror field, for the same reason: mapping is exact, and a lookup mid-edit
// would read a map of text the editor is still ahead of). Re-placement happens only when the
// thread list changes or a re-parsed document replaces the current one.
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { paintRange } from '$lib/editor/visual/highlight/paintRange';
import type { Node as PMNode } from 'prosemirror-model';
import { buildAnchor, type CommentAnchor } from '$lib/comments/anchor';
import { indexStartingBy, pmToSource, type Segment, type SourceMap } from '../sourceSpans';

import { threadAtPointer } from '$lib/comments/threadAtPointer';
import { focusPmSuggestionMeta, pmSuggestions, pmSuggestionsKey } from './pmSuggestions';
import { refuseDropOnGoneBlocks } from './goneBlocksRefuseDrop';
import { pmDecisionSteps } from './pmDecisionStep';
import { pmSelectionToolbar } from './pmSelectionToolbar';

export { flattenDoc, placePmComments, pmRangeOf, type FlatDoc } from './pmCommentsResolve';

export type PmCommentRange = {
	id: string;
	from: number;
	to: number;
	resolved: boolean;
	/** a node that draws its own content, tinted whole */
	node?: boolean;
};

type PmCommentsState = {
	ranges: PmCommentRange[];
	focused: string | null;
	/** the selection a composer is being written for: held visible while the editor is blurred */
	pending: { from: number; to: number } | null;
	deco: DecorationSet;
};

type PmCommentsMeta =
	| { type: 'set'; ranges: PmCommentRange[] }
	| { type: 'focus'; id: string | null }
	| { type: 'pending'; range: { from: number; to: number } | null };

export const pmCommentsKey = new PluginKey<PmCommentsState>('texpile-comments');

/** a comment on exactly the words a step replaced moves onto the new words, as in the source editor */
function replacedExactly(tr: Transaction, from: number, to: number): { from: number; to: number } | null {
	let a = from;
	let b = to;
	let hit = false;
	for (const map of tr.mapping.maps) {
		let exact: { from: number; to: number } | null = null;
		map.forEach((oldStart, oldEnd, newStart, newEnd) => {
			if (oldStart === a && oldEnd === b && newEnd > newStart) exact = { from: newStart, to: newEnd };
		});
		if (exact) {
			({ from: a, to: b } = exact);
			hit = true;
		} else {
			a = map.map(a, 1);
			b = map.map(b, -1);
		}
	}
	return hit && b > a ? { from: a, to: b } : null;
}

/** replace every range; the store folds its whole log, so partial updates would not buy anything */
export function setPmComments(view: EditorView, ranges: PmCommentRange[]): void {
	view.dispatch(view.state.tr.setMeta(pmCommentsKey, { type: 'set', ranges } satisfies PmCommentsMeta));
}

/** which thread the reader is looking at, so its highlight can be picked out from the rest */
export function focusPmComment(view: EditorView, id: string | null): void {
	view.dispatch(
		view.state.tr
			.setMeta(pmCommentsKey, { type: 'focus', id } satisfies PmCommentsMeta)
			.setMeta(pmSuggestionsKey, focusPmSuggestionMeta(id))
	);
}

/**
 * Tint (or stop tinting) the selection a comment is being composed for. The browser hides the
 * native selection the moment the composer takes focus, which read as "my selection vanished";
 * the decoration keeps the commented text visible until the composer commits or cancels.
 */
export function setPmCommentPending(view: EditorView, range: { from: number; to: number } | null): void {
	if ((pmCommentsKey.getState(view.state)?.pending ?? null) === range) return;
	view.dispatch(view.state.tr.setMeta(pmCommentsKey, { type: 'pending', range } satisfies PmCommentsMeta).setMeta('addToHistory', false));
}

/**
 * Scroll a placed thread into view and park the caret on it. False when this view has not placed it.
 *
 * This is what the panel should use in visual mode, in preference to a source line pushed back
 * through the block map: the map is block-granular, so a line jump lands at the top of whatever
 * block contains the comment, while the plugin has already resolved the thread to the exact
 * characters it covers. The highlight the reader is being sent to is the one thing we know precisely.
 *
 * A COLLAPSED caret, not a selection over the quote: a non-empty selection raises the "Comment"
 * pill, and offering to comment on a comment is not what the click asked for. The focused-highlight
 * tint is what shows the extent.
 *
 * Focus is deliberately not taken. The click happened in the panel, next to a reply box; scrolling
 * is what was asked for, and yanking the caret out of the dock is not.
 */
export function revealPmComment(view: EditorView, id: string): boolean {
	const r =
		(pmCommentsKey.getState(view.state)?.ranges ?? []).find((x) => x.id === id) ??
		(pmSuggestionsKey.getState(view.state)?.ranges ?? []).find((x) => x.id === id);
	if (!r) return false;
	const $at = view.state.doc.resolve(r.from);
	// TextSelection.near rather than .create: a comment can start at a block edge, and near() finds
	// the closest position a caret may legally occupy instead of throwing
	const sel = TextSelection.near($at, 1);
	if (!(sel instanceof TextSelection)) return false;
	try {
		view.dispatch(view.state.tr.setSelection(sel).setMeta('addToHistory', false));
	} catch {
		return false; // the doc moved under the range; the caller falls back to the line jump
	}
	const at = view.coordsAtPos(sel.from);
	let box: HTMLElement | null = view.dom.parentElement;
	while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
	if (!box) return true;
	const b = box.getBoundingClientRect();
	if (at.top < b.top + REVEAL_EDGE || at.bottom > b.bottom - REVEAL_EDGE) box.scrollTop += at.top - (b.top + b.height / 3);
	return true;
}
const REVEAL_EDGE = 40;

/** the innermost thread at a position, so nested comments resolve to the one you clicked */
export function pmCommentAt(state: EditorState, pos: number): PmCommentRange | null {
	let best: PmCommentRange | null = null;
	for (const r of pmCommentsKey.getState(state)?.ranges ?? []) {
		if (r.resolved || pos < r.from || pos > r.to) continue;
		if (!best || r.to - r.from < best.to - best.from) best = r;
	}
	return best;
}

/** a thread's colour at two strengths, so a focused one stands out of its neighbours; the CodeMirror
 *  blocks that draw a thread's characters themselves read it too */
export function threadTint(focused: boolean): string {
	return `color-mix(in srgb, var(--comment-tint) ${focused ? 30 : 14}%, transparent)`;
}

function build(doc: PMNode, ranges: PmCommentRange[], focused: string | null, pending: { from: number; to: number } | null): DecorationSet {
	const size = doc.content.size;
	const decos: Decoration[] = [];
	for (const r of ranges) {
		// resolved threads draw nothing, same as the source editor: the argument is over
		if (r.resolved || r.to <= r.from || r.to > size) continue;
		const focus = r.id === focused;
		decos.push(
			...paintRange(doc, {
				from: r.from,
				to: r.to,
				tint: threadTint(focus),
				key: `thread-${r.id}`,
				reach: 'text',
				mirrored: true,
				whole: r.node,
				class: `pm-comment${focus ? ' pm-comment-focused' : ''}`,
				attrs: { 'data-comment': r.id }
			})
		);
	}
	// the passage a composer is being written for, held while the composer owns the focus: the
	// selection's own colour, because a crossed formula goes on wearing it through all of this
	if (pending && pending.to > pending.from) {
		decos.push(
			...paintRange(doc, {
				from: pending.from,
				to: pending.to,
				tint: 'var(--editor-selection)',
				key: 'composer',
				reach: 'line',
				class: 'pm-comment-pending'
			})
		);
	}
	return DecorationSet.create(doc, decos);
}

/** the selection as a range of the file; see sourceAnchorFor */
export type SourceAnchorFn = (doc: PMNode, from: number, to: number) => CommentAnchor | null;

/** the byte on the side named of a position, or the nearest run's edge when nothing is drawn between */
function drawnByte(doc: PMNode, leaves: Segment[], pos: number, assoc: -1 | 1): number | null {
	const exact = pmToSource(leaves, pos, assoc);
	if (exact !== null) return exact;
	const i = indexStartingBy(leaves, 'pmFrom', pos);
	const run = assoc < 0 ? (i >= 0 ? leaves[i] : null) : i + 1 < leaves.length ? leaves[i + 1] : null;
	if (!run) return null;
	const edge = assoc < 0 ? run.pmTo : run.pmFrom;
	const drawn = assoc < 0 ? doc.textBetween(edge, pos, '', '\uFFFC') : doc.textBetween(pos, edge, '', '\uFFFC');
	if (drawn !== '') return null;
	return assoc < 0 ? run.srcTo : run.srcFrom;
}

/**
 * The anchor for a selection in the rendered document: the range of the FILE its characters are,
 * through the source map. Exact at both ends or nothing, since a comment pinned to a guess would
 * describe text the reader never chose; an end between blocks, with nothing drawn between it and
 * the last character, is that character's. A point takes the character before it.
 */
export function sourceAnchorFor(doc: PMNode, map: SourceMap, text: string, from: number, to: number): CommentAnchor | null {
	if (from === to) {
		const at = pmToSource(map.leaves, from, -1) ?? pmToSource(map.leaves, from, 1);
		return at === null || at > text.length ? null : buildAnchor(text, at, at);
	}
	const a = drawnByte(doc, map.leaves, from, 1);
	const b = drawnByte(doc, map.leaves, to, -1);
	if (a === null || b === null || b <= a || b > text.length) return null;
	return buildAnchor(text, a, b);
}

type PmCommentsConfig = {
	/** commented text was clicked. Selection only - the panel decides whether it is even open. */
	onSelect?: (id: string) => void;
	/** the reader asked to comment on the current selection; null when it spans no real text */
	onAdd?: (anchor: CommentAnchor | null) => void;
	sourceAnchor?: SourceAnchorFn;
	/** label for the pill, so the caller owns translation */
	addLabel?: string;
};

export function pmComments({ onSelect, onAdd, sourceAnchor, addLabel = 'Comment' }: PmCommentsConfig = {}): Plugin[] {
	const state = new Plugin<PmCommentsState>({
		key: pmCommentsKey,
		state: {
			init: () => ({ ranges: [], focused: null, pending: null, deco: DecorationSet.empty }),
			apply(tr, value) {
				const meta = tr.getMeta(pmCommentsKey) as PmCommentsMeta | undefined;
				if (meta?.type === 'set') return { ...value, ranges: meta.ranges, deco: build(tr.doc, meta.ranges, value.focused, value.pending) };
				if (meta?.type === 'focus') return { ...value, focused: meta.id, deco: build(tr.doc, value.ranges, meta.id, value.pending) };
				if (meta?.type === 'pending')
					return { ...value, pending: meta.range, deco: build(tr.doc, value.ranges, value.focused, meta.range) };
				if (!tr.docChanged) return value;
				// A comment covers the text it was made about, and nothing typed after the fact at
				// its edges: bias 1 on `from` and -1 on `to` both point AWAY from the range, so
				// text inserted at a boundary lands outside it. Same rule as the source editor's
				// field (extensions/comments.ts) - the two views must agree about where a thread
				// ends. An edit strictly inside still extends it.
				const mapped: PmCommentRange[] = [];
				for (const r of value.ranges) {
					const exact = r.to > r.from ? replacedExactly(tr, r.from, r.to) : null;
					if (exact) {
						mapped.push({ ...r, ...exact });
						continue;
					}
					if (r.to === r.from) {
						const at = tr.mapping.map(r.from, -1);
						mapped.push({ ...r, from: at, to: at });
						continue;
					}
					const from = tr.mapping.map(r.from, 1);
					const to = tr.mapping.map(r.to, -1);
					if (to > from) mapped.push({ ...r, from, to });
					else mapped.push({ ...r, from: Math.min(from, to), to: Math.min(from, to) });
				}
				// the pending tint follows edits the same way, and collapses away if its text goes
				let pending = value.pending;
				if (pending) {
					const from = tr.mapping.map(pending.from, 1);
					const to = tr.mapping.map(pending.to, -1);
					pending = to > from ? { from, to } : null;
				}
				return { ...value, ranges: mapped, pending, deco: build(tr.doc, mapped, value.focused, pending) };
			}
		},
		props: {
			decorations(state) {
				return pmCommentsKey.getState(state)?.deco ?? DecorationSet.empty;
			},
			// what is drawn under the pointer, not the caret's place: a click just beside a thread is not on it
			handleClick(_view, _pos, event) {
				const id = threadAtPointer(event.target);
				if (!onSelect || !id) return false;
				onSelect(id);
				// not handled: the click should still place the caret where it landed
				return false;
			}
		}
	});
	return [
		state,
		pmSuggestions(),
		refuseDropOnGoneBlocks(),
		pmDecisionSteps(),
		...(onAdd && sourceAnchor ? [pmSelectionToolbar(onAdd, addLabel, sourceAnchor)] : [])
	];
}
