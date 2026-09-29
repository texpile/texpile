// Review comments in the source editor: the highlight under commented text, the mark on its line
// number, and the selection toolbar in the left margin (cmSelectionToolbar).
//
// There is no comments plugin for CodeMirror 6 - not an official one, and nothing maintained worth
// taking - so this is the usual shape: a StateField holding a RangeSet of decorations, remapped
// through every transaction. Overleaf's extensions/ranges.ts is the same thing at four times the
// size, because it also carries tracked changes.
//
// Ranges arrive already resolved. Anchoring lives in $lib/comments/anchor and runs on load; once a
// range is in this field, CodeMirror's own mapping keeps it correct through every edit, exactly and
// for free. Nothing here re-searches the document.
import { EditorView, Decoration, type DecorationSet, gutterLineClass, GutterMarker, type BlockInfo } from '@codemirror/view';
import { StateEffect, StateField, RangeSet, type Extension, type EditorState } from '@codemirror/state';
import { cmSuggestions } from '$lib/editor/source/cmSuggestions';
import { threadAtPointer } from '$lib/comments/threadAtPointer';
import { cmSelectionToolbar } from './cmSelectionToolbar';

export type CommentRange = {
	id: string;
	from: number;
	to: number;
	resolved: boolean;
};

/** the thread whose mark sits on this line: the one that begins there */
function threadStartingOn(state: EditorState, line: BlockInfo): CommentRange | null {
	return (state.field(commentRanges, false) ?? []).find((r) => !r.resolved && r.from >= line.from && r.from <= line.to) ?? null;
}

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
			if (e.is(setCommentRanges)) return e.value.filter((r) => r.from >= 0 && r.to >= r.from && r.to <= tr.newDoc.length);
		if (!tr.docChanged) return ranges;
		// A comment covers the text it was made about, and nothing typed after the fact at its
		// edges: assoc 1 on `from` and -1 on `to` both point AWAY from the range, so text inserted
		// at a boundary lands outside it. (The reverse - what this used to do - grows the highlight
		// under the cursor as you keep typing, which reads as the comment refusing to end.) An edit
		// strictly inside still extends it.
		const mapped: CommentRange[] = [];
		// a comment on exactly the replaced words moves onto the new ones, as in a file that is not open
		const replaced = new Map<string, { from: number; to: number }>();
		tr.changes.iterChanges((fromA, toA, fromB, toB) => {
			if (toA > fromA && toB > fromB) replaced.set(`${fromA}:${toA}`, { from: fromB, to: toB });
		});
		for (const r of ranges) {
			const exact = replaced.get(`${r.from}:${r.to}`);
			if (exact) {
				mapped.push({ ...r, ...exact });
				continue;
			}
			if (r.to === r.from) {
				const at = tr.changes.mapPos(r.from, -1);
				mapped.push({ ...r, from: at, to: at });
				continue;
			}
			const from = tr.changes.mapPos(r.from, 1);
			const to = tr.changes.mapPos(r.to, -1);
			if (to > from) mapped.push({ ...r, from, to });
			else mapped.push({ ...r, from: Math.min(from, to), to: Math.min(from, to) });
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
			.filter((r) => !r.resolved && r.to > r.from)
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
			const hit = threadStartingOn(view.state, line);
			// unmarked lines fall through, so clicking a bare line number keeps doing whatever it did
			if (!hit) return false;
			onSelect(hit.id);
			return true;
		}
	};
}

export function liveCommentRanges(state: EditorState): CommentRange[] {
	return state.field(commentRanges, false) ?? [];
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
	onSelect?: (id: string) => void;
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
			// what is drawn under the pointer, not the caret's place: a click just beside a thread is not on it
			mousedown(event) {
				const id = threadAtPointer(event.target);
				if (!onSelect || !id) return false;
				onSelect(id);
				// not handled: the click should still place the caret where it landed
				return false;
			}
		}),
		cmSuggestions(),
		onAdd ? cmSelectionToolbar(onAdd, addLabel) : [],
		theme
	];
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
	}
});
