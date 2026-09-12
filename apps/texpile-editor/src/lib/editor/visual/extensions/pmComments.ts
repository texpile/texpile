// Review comments in the visual editor: the highlight under commented text, and the click that
// selects a thread. The ProseMirror counterpart of extensions/comments.ts, deliberately smaller -
// the panel, the log and the anchors are all shared, so this file is only "turn threads into
// decorations for THIS representation".
//
// Anchors are stored in SOURCE dialect and are never rewritten here (resolution is read-only; an
// anchor rewritten to visual text would stop describing the file on disk). Resolution happens
// against the flat text of the rendered document: prose survives the LaTeX -> visual round trip
// verbatim, so the same quote search that places a thread in CodeMirror places it here. What does
// NOT survive - quotes containing markup, math, line-wrap whitespace - fails to resolve and the
// thread simply draws nothing in this view; the panel still lists it, and the source editor still
// places it. Honest absence over a guessed highlight, same policy as anchor.ts.
//
// Once resolved, ranges are MAPPED through every transaction rather than re-searched (the same
// discipline as the CodeMirror field, for the same reason: mapping is exact, re-searching mid-edit
// can snap a range onto another copy of the text). Re-resolution happens only when the thread list
// changes or a re-parsed document replaces the current one.
import { Plugin, PluginKey, TextSelection, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { buildAnchor, type CommentAnchor } from '$lib/comments/anchor';
import { settings, updateSettings } from '$lib/settings';
import { observe } from '$lib/runes/observe.svelte';
import { m } from '$lib/paraglide/messages';

import { flattenDoc } from './pmCommentsResolve';

export { flattenDoc, resolvePmComments, type FlatDoc } from './pmCommentsResolve';

export type PmCommentRange = {
	id: string;
	from: number;
	to: number;
	resolved: boolean;
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

/** replace every range; the store folds its whole log, so partial updates would not buy anything */
export function setPmComments(view: EditorView, ranges: PmCommentRange[]): void {
	view.dispatch(view.state.tr.setMeta(pmCommentsKey, { type: 'set', ranges } satisfies PmCommentsMeta));
}

/** which thread the reader is looking at, so its highlight can be picked out from the rest */
export function focusPmComment(view: EditorView, id: string | null): void {
	view.dispatch(view.state.tr.setMeta(pmCommentsKey, { type: 'focus', id } satisfies PmCommentsMeta));
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
	const r = (pmCommentsKey.getState(view.state)?.ranges ?? []).find((x) => x.id === id);
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

function build(doc: PMNode, ranges: PmCommentRange[], focused: string | null, pending: { from: number; to: number } | null): DecorationSet {
	const decos = ranges
		// resolved threads draw nothing, same as the source editor: the argument is over
		.filter((r) => !r.resolved && r.to > r.from)
		.map((r) =>
			Decoration.inline(r.from, r.to, {
				class: `pm-comment${r.id === focused ? ' pm-comment-focused' : ''}`,
				'data-comment': r.id
			})
		);
	if (pending && pending.to > pending.from) decos.push(Decoration.inline(pending.from, pending.to, { class: 'pm-comment-pending' }));
	return DecorationSet.create(doc, decos);
}

/**
 * An anchor for a selection in the rendered document, built against the FLAT text.
 *
 * Rendered-dialect on purpose: the selection is rendered text, so this is the one dialect the
 * anchor is certain to be faithful in. Resolving it back in source mode goes through the same
 * normalize-and-search fallback that carries source anchors the other way.
 */
export function buildPmAnchor(doc: PMNode, from: number, to: number): CommentAnchor | null {
	const { text, index } = flattenDoc(doc);
	// pm -> flat: first flat char at or after `from`, last flat char before `to`
	let f = 0;
	while (f < index.length && index[f] < from) f++;
	let t = f;
	while (t < index.length && index[t] < to) t++;
	if (t <= f) return null;
	return buildAnchor(text, f, t);
}

export function buildPmPoint(doc: PMNode, pos: number): CommentAnchor {
	const { text, index } = flattenDoc(doc);
	let f = 0;
	while (f < index.length && index[f] < pos) f++;
	return buildAnchor(text, f, f);
}

type PmCommentsConfig = {
	/** commented text was clicked. Selection only - the panel decides whether it is even open. */
	onSelect?: (id: string) => void;
	/** the reader asked to comment on the current selection; null when it spans no real text */
	onAdd?: (anchor: CommentAnchor | null) => void;
	/** label for the pill, so the caller owns translation */
	addLabel?: string;
};

export function pmComments({ onSelect, onAdd, addLabel = 'Comment' }: PmCommentsConfig = {}): Plugin[] {
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
			handleClick(view, pos) {
				if (!onSelect) return false;
				const hit = pmCommentAt(view.state, pos);
				if (!hit) return false;
				onSelect(hit.id);
				// not handled: the click should still place the caret where it landed
				return false;
			}
		}
	});
	return [state, ...(onAdd ? [addPill(onAdd, addLabel)] : [])];
}

/** the pill fades in rather than flashing under the pointer for every drag it passes through */
const SHOW_DELAY = 120;

function svgIcon(body: string) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
const COMMENT_ICON = svgIcon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>');
const X_ICON = svgIcon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');

/**
 * The Comment affordance for a non-empty selection: a small tooltip button floating ABOVE the
 * selection, sharing the source pill's .cm-comment-add chrome from app.css.
 *
 * Above rather than the source editor's left-margin placement, because the visual editor's left
 * margin is already spoken for: the block-handle plugin parks its + and drag grips there, and the
 * pill landed on top of them. Centred over the selection on one line; over the selection head when
 * it spans lines. Flips below when the selection starts at the top of the window.
 *
 * Structurally simpler than the CodeMirror twin because ProseMirror permits layout reads in a
 * plugin view's update(); there is no requestMeasure discipline to follow. Scroll and pane-resize
 * move the text without an editor update, so a capture-phase scroll listener and a ResizeObserver
 * cover what update() cannot see.
 */
function addPill(onAdd: (anchor: CommentAnchor | null) => void, label: string): Plugin {
	return new Plugin({
		view(view) {
			// a ROW, not a lone button: the dismiss control sits at its end, so the pill carries the
			// means of getting rid of it. Turning it off is a SETTING, not a one-shot hide - the
			// complaint it answers is "this thing keeps covering my text", which recurs.
			const dom = document.createElement('div');
			// named for parity with the CodeMirror twin's row; this editor loads no baseTheme, so
			// the geometry below is inline rather than from that class
			dom.className = 'cm-comment-add-row';
			Object.assign(dom.style, {
				position: 'fixed',
				zIndex: '5',
				display: 'none',
				alignItems: 'center',
				gap: '2px',
				opacity: '0',
				transition: 'opacity 0.05s ease-in'
			});
			// geometry inline: the shared class only carries colours (the CM side gets these same
			// properties from its baseTheme, which this editor does not load)
			function button(title: string, svg: string, width: string, onDown: () => void) {
				const b = dom.appendChild(document.createElement('button'));
				b.className = 'cm-comment-add';
				b.title = title;
				b.setAttribute('aria-label', title);
				b.innerHTML = svg;
				Object.assign(b.style, {
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					width,
					height: '26px',
					padding: '0',
					cursor: 'pointer'
				});
				// mousedown, not click: by the time click fires the editor has collapsed the selection
				// under the pointer and there is nothing left to comment on
				b.onmousedown = (e) => {
					e.preventDefault();
					onDown();
				};
			}
			button(label, COMMENT_ICON, '26px', () => {
				const sel = view.state.selection;
				if (!(sel instanceof TextSelection) || sel.empty) return;
				const anchor = buildPmAnchor(view.state.doc, sel.from, sel.to);
				onAdd(anchor);
				// the composer is about to take focus and the browser will hide the native
				// selection with it; pin the commented text under a decoration until it closes
				if (anchor) setPmCommentPending(view, { from: sel.from, to: sel.to });
			});
			button(m.comments_pill_off(), X_ICON, '20px', () => {
				updateSettings({ commentPill: false });
				hide(); // the setting keeps it off; this is only so it leaves under the pointer
			});
			// NEXT TO the editor, never inside it: view.dom is the contenteditable ProseMirror root,
			// whose children the view owns - its mutation observer treats a foreign child as document
			// DOM and removes it (the CodeMirror twin gets away with view.dom.appendChild because CM's
			// view.dom is a wrapper around the editable area, not the editable area itself). The
			// parent also sits outside the zoom style EditorView puts on the root, which would have
			// scaled the fixed-position button against its own coordinates.
			(view.dom.parentElement ?? document.body).appendChild(dom);

			let timer: ReturnType<typeof setTimeout> | null = null;
			let shown = false;
			function hide() {
				if (timer) {
					clearTimeout(timer);
					timer = null;
				}
				shown = false;
				dom.style.opacity = '0';
				dom.style.display = 'none';
			}
			function place() {
				const sel = view.state.selection;
				// turned off in Preferences: the pill never appears, and the plugin costs a boolean
				if (settings.current.commentPill === false || !(sel instanceof TextSelection) || sel.empty) {
					hide();
					return;
				}
				let a: { top: number; bottom: number; left: number; right: number };
				let b: typeof a;
				try {
					a = view.coordsAtPos(sel.from);
					b = view.coordsAtPos(sel.to);
				} catch {
					hide();
					return;
				}
				const head = sel.head === sel.from ? a : b;
				// scrolled out of the window: hide rather than park the tooltip at the edge
				if (head.bottom < 0 || head.top > window.innerHeight) {
					hide();
					return;
				}
				const oneLine = Math.abs(a.top - b.top) < 2;
				const cx = oneLine ? (a.left + b.right) / 2 : (head.left + head.right) / 2;
				const anchor = oneLine ? a : head;
				// above the line, else below it when the selection starts at the top of the window
				const top = anchor.top - 26 - 6 >= 4 ? anchor.top - 26 - 6 : anchor.bottom + 6;
				// display before measuring: offsetWidth is 0 while the row is hidden, and the row is
				// wider than the old lone button
				dom.style.display = 'flex';
				const half = (dom.offsetWidth || 48) / 2;
				dom.style.top = `${top}px`;
				dom.style.left = `${Math.min(Math.max(cx - half, 4), window.innerWidth - half * 2 - 4)}px`;
				if (!shown && !timer) {
					timer = setTimeout(() => {
						timer = null;
						shown = true;
						dom.style.opacity = '1';
					}, SHOW_DELAY);
				}
			}
			window.addEventListener('scroll', place, true);
			const ro = new ResizeObserver(place);
			ro.observe(view.dom);
			// the toggle has to bite without waiting for the next selection change, in both directions
			const unsub = observe(
				() => settings.current,
				() => place()
			);
			return {
				update: place,
				destroy() {
					window.removeEventListener('scroll', place, true);
					ro.disconnect();
					unsub();
					if (timer) clearTimeout(timer);
					dom.remove();
				}
			};
		}
	});
}
