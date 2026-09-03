// Review comments in the source editor: the highlight under commented text, the mark on its line
// number, and the pill in the left margin that offers to comment on a selection.
//
// There is no comments plugin for CodeMirror 6 - not an official one, and nothing maintained worth
// taking - so this is the usual shape: a StateField holding a RangeSet of decorations, remapped
// through every transaction. Overleaf's extensions/ranges.ts is the same thing at four times the
// size, because it also carries tracked changes.
//
// Ranges arrive already resolved. Anchoring lives in $lib/comments/anchor and runs on load; once a
// range is in this field, CodeMirror's own mapping keeps it correct through every edit, exactly and
// for free. Nothing here re-searches the document.
import { EditorView, Decoration, type DecorationSet, ViewPlugin, gutterLineClass, GutterMarker, type BlockInfo } from '@codemirror/view';
import { StateEffect, StateField, RangeSet, type Extension, type EditorState } from '@codemirror/state';
import { settings, updateSettings } from '$lib/settings';
import { observe } from '$lib/runes/observe.svelte';
import { m } from '$lib/paraglide/messages';

export type CommentRange = {
	id: string;
	from: number;
	to: number;
	resolved: boolean;
};

/** replace every range; the store folds its whole log, so partial updates would not buy anything */
export const setCommentRanges = StateEffect.define<CommentRange[]>();

/** which thread the reader is looking at, so its highlight can be picked out from the rest */
export const focusCommentThread = StateEffect.define<string | null>();

const focusedThread = StateField.define<string | null>({
	create: () => null,
	update(id, tr) {
		for (const e of tr.effects) if (e.is(focusCommentThread)) return e.value;
		return id;
	}
});

/**
 * The ranges themselves, kept apart from their decorations.
 *
 * Decorations alone would be enough to draw with, but a click has to answer "which thread is under
 * this position", and a RangeSet of decorations cannot be asked that without unpicking the specs
 * again. Keeping the plain list is cheaper than the alternative and survives mapping just as well.
 */
const commentRanges = StateField.define<CommentRange[]>({
	create: () => [],
	update(ranges, tr) {
		// Adoption validates against THIS document. The controller resolves ranges against its own
		// text, which can be another file's (a mount adopting mid-switch) or a longer, stale copy of
		// this one - and a single out-of-range position makes the gutter's lineAt() throw inside
		// every later transaction, wedging the whole editor. Dropped rather than clamped: clamped it
		// would highlight text the comment was never about; the next reanchor re-supplies the rest.
		for (const e of tr.effects)
			if (e.is(setCommentRanges)) return e.value.filter((r) => r.from >= 0 && r.to > r.from && r.to <= tr.newDoc.length);
		if (!tr.docChanged) return ranges;
		// A comment covers the text it was made about, and nothing typed after the fact at its
		// edges: assoc 1 on `from` and -1 on `to` both point AWAY from the range, so text inserted
		// at a boundary lands outside it. (The reverse - what this used to do - grows the highlight
		// under the cursor as you keep typing, which reads as the comment refusing to end.) An edit
		// strictly inside still extends it, and a range whose text is gone collapses and is dropped.
		const mapped: CommentRange[] = [];
		for (const r of ranges) {
			const from = tr.changes.mapPos(r.from, 1);
			const to = tr.changes.mapPos(r.to, -1);
			if (to > from) mapped.push({ ...r, from, to });
		}
		return mapped;
	}
});

const commentDecorations = StateField.define<DecorationSet>({
	create: (state) => build(state),
	update(deco, tr) {
		const touched = tr.effects.some((e) => e.is(setCommentRanges) || e.is(focusCommentThread));
		if (!tr.docChanged && !touched) return deco;
		return build(tr.state);
	},
	provide: (f) => EditorView.decorations.from(f)
});

function build(state: EditorState): DecorationSet {
	const focus = state.field(focusedThread, false) ?? null;
	return RangeSet.of(
		(state.field(commentRanges, false) ?? [])
			// resolved threads are not decorated at all. The point of resolving is that the argument
			// is over, and leaving a mark on the text says the opposite; the panel still lists them
			// under "Show resolved".
			.filter((r) => !r.resolved)
			.map((r) =>
				Decoration.mark({
					class: `cm-comment${r.id === focus ? ' cm-comment-focused' : ''}`,
					attributes: { 'data-comment': r.id }
				}).range(r.from, r.to)
			),
		true
	);
}

/**
 * Click handlers for the line-number gutter, to be spread into `lineNumbers({ domEventHandlers })`.
 *
 * They cannot live in this extension's own EditorView.domEventHandlers: those bind to contentDOM,
 * the editable text, so a click in a gutter never reaches them. A gutter takes its handlers through
 * its own config, and the gutter here is the caller's - the whole point of gutterLineClass was to
 * mark the line-number cells rather than add a column of our own.
 */
export function commentGutterHandlers(onSelect: (id: string) => void) {
	return {
		mousedown(view: EditorView, line: BlockInfo): boolean {
			const hit = (view.state.field(commentRanges, false) ?? []).find((r) => !r.resolved && r.from >= line.from && r.from <= line.to);
			// unmarked lines fall through, so clicking a bare line number keeps doing whatever it did
			if (!hit) return false;
			onSelect(hit.id);
			return true;
		}
	};
}

/** the innermost thread at a position, so nested comments resolve to the one you clicked */
export function commentAt(state: EditorState, pos: number): CommentRange | null {
	let best: CommentRange | null = null;
	for (const r of state.field(commentRanges, false) ?? []) {
		if (pos < r.from || pos > r.to) continue;
		if (!best || r.to - r.from < best.to - best.from) best = r;
	}
	return best;
}

/**
 * Marks a line as carrying a comment, WITHOUT adding a gutter column.
 *
 * A `gutter()` of its own cost ~10px of permanent width beside the line numbers, present in every
 * document whether or not it had a single comment. gutterLineClass puts a class on the existing
 * gutter cells instead, and the style is an inset shadow, so the indicator takes no layout at all.
 */
class CommentLine extends GutterMarker {
	override elementClass = 'cm-comment-line';
	override eq() {
		// every marked line is marked the same way; resolved threads are not marked at all
		return true;
	}
}

const commentLine = new CommentLine();

type CommentsConfig = {
	/**
	 * A thread was clicked, and where.
	 *
	 * The two are not the same request. The gutter mark exists for no other reason than to point at
	 * a comment, so clicking it means "show me it"; clicking the prose is someone working in their
	 * document who happened to land on commented text, and rearranging the window under them for
	 * that would be rude.
	 */
	onSelect?: (id: string, from: 'text' | 'gutter') => void;
	/** the reader asked to comment on the current selection */
	onAdd?: (from: number, to: number) => void;
	/** label for the tooltip button, so the caller owns translation */
	addLabel?: string;
};

export function comments({ onSelect, onAdd, addLabel = 'Comment' }: CommentsConfig = {}): Extension {
	return [
		focusedThread,
		commentRanges,
		commentDecorations,
		// only the line a thread BEGINS on. Marking every line a range covered read as four separate
		// comments on a four-line quote.
		gutterLineClass.compute([commentRanges], (state) => {
			const lines = new Set<number>();
			for (const r of state.field(commentRanges, false) ?? []) {
				if (!r.resolved) lines.add(state.doc.lineAt(r.from).from);
			}
			return RangeSet.of(
				[...lines].sort((a, b) => a - b).map((at) => commentLine.range(at)),
				true
			);
		}),
		EditorView.domEventHandlers({
			mousedown(event, view) {
				if (!onSelect) return false;
				const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
				if (pos === null) return false;
				const hit = commentAt(view.state, pos);
				if (!hit) return false;
				onSelect(hit.id, 'text');
				// not handled: the click should still place the caret where it landed
				return false;
			}
		}),
		onAdd ? addButton(onAdd, addLabel) : [],
		theme
	];
}

/** the pill fades in rather than flashing under the pointer for every drag it passes through */
const SHOW_DELAY = 120;

function svgIcon(body: string) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
const COMMENT_ICON = svgIcon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>');
const X_ICON = svgIcon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');

/**
 * The Comment affordance for a non-empty selection: an icon pill in the LEFT margin, vertically
 * centred on the cursor's line.
 *
 * This is Overleaf's editor-floating-menu, whose measure is `right: window.innerWidth -
 * contentDOM.left` - the pill's right edge flush against the left edge of the text, so it lands in
 * the gutter and covers nothing. A tooltip above the selection sits ON the line you are reading to
 * decide, and the right margin is already spoken for here by the preview divider and its lozenge.
 *
 * `position: fixed` with a measured `right`, not `absolute` inside the editor: the gutter's width
 * changes with the line count and the pane's own left edge moves when the sidebar resizes, and
 * fixed coordinates read off contentDOM track both without a second source of truth.
 */
function addButton(onAdd: (from: number, to: number) => void, label: string): Extension {
	return ViewPlugin.fromClass(
		class {
			/** the row: the Comment button, then the control that turns the whole thing off */
			private readonly dom: HTMLDivElement;
			private timer: ReturnType<typeof setTimeout> | null = null;
			private shown = false;
			private readonly resize: ResizeObserver;
			private readonly unsub: () => void;

			constructor(private readonly view: EditorView) {
				this.dom = document.createElement('div');
				this.dom.className = 'cm-comment-add-row';
				this.dom.style.display = 'none';
				const button = (title: string, svg: string, extra: string, onDown: () => void) => {
					const b = this.dom.appendChild(document.createElement('button'));
					b.className = `cm-comment-add${extra}`;
					b.title = title;
					b.setAttribute('aria-label', title);
					b.innerHTML = svg;
					// mousedown, not click: by the time click fires the editor has collapsed the selection
					// under the pointer and there is nothing left to comment on
					b.onmousedown = (e) => {
						e.preventDefault();
						onDown();
					};
				};
				button(label, COMMENT_ICON, '', () => {
					const sel = view.state.selection.main;
					if (!sel.empty) onAdd(sel.from, sel.to);
				});
				button(m.comments_pill_off(), X_ICON, ' cm-comment-add-off', () => {
					updateSettings({ commentPill: false });
					this.hide(); // the setting keeps it off; this is only so it leaves under the pointer
				});
				view.dom.appendChild(this.dom);
				// scrolling moves the line without changing the viewport, so update() alone would
				// leave the pill behind; the observer catches pane and window resizes, which move
				// contentDOM's left edge without any editor update at all
				view.scrollDOM.addEventListener('scroll', this.schedule);
				this.resize = new ResizeObserver(this.schedule);
				this.resize.observe(view.scrollDOM);
				// the toggle has to bite without waiting for the next selection change, both ways
				this.unsub = observe(
					() => settings.current,
					() => this.schedule()
				);
				this.schedule();
			}

			update() {
				this.schedule();
			}

			destroy() {
				this.view.scrollDOM.removeEventListener('scroll', this.schedule);
				this.resize.disconnect();
				this.unsub();
				if (this.timer) clearTimeout(this.timer);
				this.dom.remove();
			}

			/**
			 * Measuring has to go through requestMeasure.
			 *
			 * coordsAtPos reads DOM layout, and CodeMirror forbids that inside update() - it throws
			 * "Reading the editor layout isn't allowed during an update" and disables the plugin,
			 * which is why calling it directly meant the pill never appeared at all. The read phase
			 * runs once the update has settled; write is where the style goes.
			 */
			private schedule = () => {
				this.view.requestMeasure<{ top: number; right: number } | null>({
					key: 'cm-comment-add',
					read: (view) => {
						const sel = view.state.selection.main;
						// turned off in Preferences: the pill never appears
						if (settings.current.commentPill === false || sel.empty) return null;
						const coords = view.coordsAtPos(sel.head);
						if (!coords) return null;
						const scroller = view.scrollDOM.getBoundingClientRect();
						// scrolled out of the pane: hide rather than park the pill at the edge
						if (coords.top < scroller.top || coords.top > scroller.bottom) return null;
						const height = this.dom.getBoundingClientRect().height;
						return {
							top: (coords.top + coords.bottom) / 2 - height / 2,
							right: window.innerWidth - view.contentDOM.getBoundingClientRect().left
						};
					},
					// written straight to the DOM: this runs on every scroll frame, and routing it
					// through state would re-render the whole plugin each time
					write: (box) => {
						if (!box) {
							this.hide();
							return;
						}
						this.dom.style.display = '';
						this.dom.style.top = `${box.top}px`;
						this.dom.style.right = `${box.right}px`;
						if (!this.shown && !this.timer) {
							this.timer = setTimeout(() => {
								this.timer = null;
								this.shown = true;
								this.dom.classList.add('cm-comment-add-visible');
							}, SHOW_DELAY);
						}
					}
				});
			};

			private hide() {
				if (this.timer) {
					clearTimeout(this.timer);
					this.timer = null;
				}
				this.shown = false;
				this.dom.classList.remove('cm-comment-add-visible');
				this.dom.style.display = 'none';
			}
		}
	);
}

const theme = EditorView.baseTheme({
	// tint only, no underline. A mark decoration draws one box per LINE it covers, so a bottom
	// border on a multi-line comment came out as a stripe under every line of it - and at 0.22 the
	// fill was strong enough to flatten the syntax colours underneath, which is the thing the
	// reader is being asked to comment on.
	'.cm-comment': {
		backgroundColor: 'color-mix(in srgb, var(--comment-tint) 14%, transparent)'
	},
	'.cm-comment-focused': {
		backgroundColor: 'color-mix(in srgb, var(--comment-tint) 30%, transparent)'
	},
	// an inset shadow rather than a border or a dot: it is painted inside the cell that is already
	// there, so a commented line costs the gutter no width. Scoped to the line-number column,
	// because gutterLineClass marks the cell in EVERY gutter on that line, the lint one included.
	'.cm-lineNumbers .cm-comment-line': {
		boxShadow: 'inset 2px 0 0 color-mix(in srgb, var(--comment-tint) 85%, transparent)',
		// it selects the thread, so it has to look like it does something
		cursor: 'pointer'
	},
	'.cm-lineNumbers .cm-comment-line:hover': {
		boxShadow: 'inset 3px 0 0 var(--comment-tint)'
	},
	// Only geometry lives here. The pill's colours need the app's surface tokens and a dark-mode
	// branch, which a CodeMirror baseTheme cannot express, so they are in app.css.
	// the ROW is what gets positioned and faded; the buttons inside it are plain chrome
	'.cm-comment-add-row': {
		position: 'fixed',
		zIndex: '5',
		display: 'flex',
		alignItems: 'center',
		gap: '2px',
		opacity: '0',
		transition: 'opacity 0.05s ease-in'
	},
	'.cm-comment-add': {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		width: '26px',
		height: '26px',
		padding: '0',
		cursor: 'pointer'
	},
	// narrower than the button it dismisses: secondary, and it must not read as a second action
	'.cm-comment-add-off': {
		width: '20px'
	},
	'.cm-comment-add-visible': {
		opacity: '1'
	}
});
