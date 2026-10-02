// suggestions drawn in the source editor
import { Decoration, EditorView, WidgetType, keymap, type DecorationSet } from '@codemirror/view';
import {
	EditorSelection,
	Prec,
	StateEffect,
	StateField,
	RangeSet,
	Transaction,
	type EditorState,
	type Extension,
	type Range
} from '@codemirror/state';
import {
	editMode,
	mapSuggestionEdges,
	noteEditedPlaces,
	noteTypedSide,
	typingSide,
	type SuggestionMark
} from '$lib/comments/activeSuggestions.svelte';
import type { TextChange } from '$lib/comments/editGestures';
import { docText } from './docText';
import { clickedSide, sideAtOldWords, type CaretSide } from '$lib/comments/oldWordsCaret';
import type { EditMode, TypingSide } from '$lib/comments/suggestCompare';

export type SuggestionRange = { id: string; from: number; to: number; restore: string; mine: boolean };

export const setSuggestionRanges = StateEffect.define<SuggestionRange[]>();
export const focusSuggestion = StateEffect.define<string | null>();
export const setCaretSide = StateEffect.define<CaretSide | null>();

const caretSide = StateField.define<CaretSide | null>({
	create: () => null,
	update(caret, tr) {
		for (const e of tr.effects) if (e.is(setCaretSide)) return e.value;
		let next = caret;
		if (next) {
			const at = tr.changes.mapPos(next.at, next.side === 'before' ? 1 : -1);
			const sel = tr.newSelection;
			next = sel.ranges.length > 1 || !sel.main.empty || sel.main.head !== at ? null : at === next.at ? next : { ...next, at };
		}
		// a delete leaves the caret at the start of what it took out, so the strikethrough stands to its
		// right whatever shape the suggestion there ends up: typing at one makes it a replacement, whose
		// old words would otherwise go back to the far side of the caret. Not when the reader has already
		// put the caret on the other side of some
		if (!next && tr.docChanged && tr.isUserEvent('delete') && tr.newSelection.main.empty)
			return { at: tr.newSelection.main.head, side: 'before' };
		return next;
	}
});

function typedAtCaret(tr: Transaction): CaretSide | null {
	// an undo puts the words back where a delete took them, it types nothing beside them
	if (tr.isUserEvent('undo')) return null;
	const caret = tr.startState.field(caretSide, false);
	return caret && tr.changes.mapPos(caret.at, -1) !== tr.changes.mapPos(caret.at, 1) ? caret : null;
}

const focused = StateField.define<string | null>({
	create: () => null,
	update(id, tr) {
		for (const e of tr.effects) if (e.is(focusSuggestion)) return e.value;
		return id;
	}
});

const ranges = StateField.define<SuggestionRange[]>({
	create: () => [],
	update(value, tr) {
		for (const e of tr.effects)
			if (e.is(setSuggestionRanges)) return e.value.filter((r) => r.from >= 0 && r.to >= r.from && r.to <= tr.newDoc.length);
		if (!tr.docChanged) return value;
		const typed = typedAtCaret(tr);
		return value.flatMap((r) => {
			const side = typed && r.restore && r.from === typed.at ? typed.side : undefined;
			if (side) noteTypedSide(r.id, side);
			return mapSuggestionEdges(r, (pos, assoc) => tr.changes.mapPos(pos, assoc), side);
		});
	}
});

// A line break has no glyph, so a suggestion that only moves one draws at zero width: splitting a
// paragraph showed nothing at all and joining two showed an empty box. Every break a suggestion
// touches is a bar, the way a diff marks one, rather than a character the reader has to decode.
function bar(way: 'added' | 'removed'): HTMLElement {
	const el = document.createElement('span');
	el.className = `cm-suggest-break cm-suggest-break-${way}`;
	return el;
}

// The file no longer has the struck words' lines, so they are drawn inside the line they were cut from, and a break
// there starts a row of its own: the deleted lines stand where they were rather than run together behind bars. Only
// a blank line has nothing to strike, and keeps the bar
function wordsOnLines(words: string): (string | HTMLElement)[] {
	const lines = words.split(/\r?\n/);
	const parts: (string | HTMLElement)[] = [];
	for (const [i, line] of lines.entries()) {
		if (i > 0) parts.push(document.createElement('br'));
		if (line) parts.push(line);
		else if (i > 0 && i < lines.length - 1) parts.push(bar('removed'));
	}
	return parts;
}

/** words with a bar wherever they held a break */
function wordsWithBars(words: string, way: 'added' | 'removed'): (string | HTMLElement)[] {
	const parts: (string | HTMLElement)[] = [];
	for (const [i, piece] of words.split('\n').entries()) {
		if (i > 0) parts.push(bar(way));
		if (piece) parts.push(piece);
	}
	return parts;
}

class BreakBar extends WidgetType {
	constructor(
		private readonly id: string,
		private readonly focus: boolean,
		private readonly way: 'added' | 'removed' = 'removed'
	) {
		super();
	}
	override eq(other: BreakBar): boolean {
		return other.id === this.id && other.focus === this.focus && other.way === this.way;
	}
	// eslint-disable-next-line @typescript-eslint/naming-convention -- @codemirror WidgetType API method
	toDOM(): HTMLElement {
		const bar = document.createElement('span');
		bar.className = `cm-suggest-break cm-suggest-break-${this.way}${this.focus ? ' cm-suggest-focused' : ''}`;
		bar.dataset.comment = this.id;
		return bar;
	}
	override ignoreEvent(): boolean {
		return false;
	}
}

class SuggestedWords extends WidgetType {
	constructor(
		private readonly text: string,
		private readonly id: string,
		private readonly focus: boolean,
		private readonly kind: 'old' | 'new'
	) {
		super();
	}
	override eq(other: SuggestedWords): boolean {
		return other.text === this.text && other.id === this.id && other.focus === this.focus && other.kind === this.kind;
	}
	// eslint-disable-next-line @typescript-eslint/naming-convention -- @codemirror WidgetType API method
	toDOM(): HTMLElement {
		const span = document.createElement('span');
		span.className = `cm-suggest-${this.kind}${this.focus ? ' cm-suggest-focused' : ''}`;
		span.dataset.comment = this.id;
		span.append(
			document.createElement('wbr'),
			...(this.kind === 'old' ? wordsOnLines(this.text) : wordsWithBars(this.text, 'added')),
			document.createElement('wbr')
		);
		return span;
	}
	override ignoreEvent(): boolean {
		return false;
	}
}

type DrawnSuggestions = { set: DecorationSet; mode: EditMode };

const decorations = StateField.define<DrawnSuggestions>({
	create: (state) => build(state),
	update(drawn, tr) {
		const changed =
			tr.docChanged ||
			tr.effects.some((e) => e.is(setSuggestionRanges) || e.is(focusSuggestion)) ||
			tr.startState.field(caretSide, false) !== tr.state.field(caretSide, false);
		return changed || drawn.mode !== editMode.current ? build(tr.state) : drawn;
	},
	provide: (f) => EditorView.decorations.from(f, (drawn) => drawn.set)
});

function build(state: EditorState): DrawnSuggestions {
	const focus = state.field(focused, false) ?? null;
	const caret = state.field(caretSide, false) ?? null;
	const out = [];
	for (const r of state.field(ranges, false) ?? []) {
		const on = r.id === focus;
		const side = caret?.at === r.from ? caret.side : typingSide(r);
		if (r.restore) {
			// whitespace alone has nothing to strike through, so it is a bar rather than an empty box
			const widget = /\S/.test(r.restore) ? new SuggestedWords(r.restore, r.id, on, 'old') : new BreakBar(r.id, on);
			out.push(Decoration.widget({ widget, side: side === 'after' ? -1 : 1 }).range(r.from));
		}
		if (r.to > r.from) {
			out.push(
				Decoration.mark({ class: `cm-suggest-new${on ? ' cm-suggest-focused' : ''}`, attributes: { 'data-comment': r.id } }).range(
					r.from,
					r.to
				)
			);
			// a mark over whitespace paints nothing, so the lines an added break OPENS carry a bar down
			// their left edge, the way a diff marks them. Only the lines it opens: the ones it merely
			// starts and ends in still hold their own words
			const added = state.doc.sliceString(r.from, r.to);
			if (added && !/\S/.test(added)) {
				let opened = 0;
				const last = state.doc.lineAt(r.to).number;
				for (let n = state.doc.lineAt(r.from).number; n <= last; n++) {
					const line = state.doc.line(n);
					if (line.from < r.from || line.to > r.to) continue;
					opened++;
					out.push(Decoration.line({ class: `cm-suggest-break-lines${on ? ' cm-suggest-focused' : ''}` }).range(line.from));
				}
				// whitespace that opens no line of its own still has to say it is there
				if (!opened) out.push(Decoration.widget({ widget: new BreakBar(r.id, on, 'added'), side: 1 }).range(r.from));
			}
		}
	}
	return { set: RangeSet.of(out, true), mode: editMode.current };
}

const NONE: SuggestionRange[] = [];

export function liveSuggestionRanges(state: EditorState): SuggestionRange[] {
	return state.field(ranges, false) ?? NONE;
}

export function fitsSuggestion(state: EditorState, s: SuggestionMark): boolean {
	const { prefix, quote, suffix } = s.anchor;
	return (
		s.from >= prefix.length &&
		s.to + suffix.length <= state.doc.length &&
		state.sliceDoc(s.from - prefix.length, s.to + suffix.length) === prefix + quote + suffix
	);
}

export function clearOfOldWords(set: DecorationSet, state: EditorState): DecorationSet {
	const cuts = [
		...new Set(
			liveSuggestionRanges(state)
				.filter((r) => r.restore)
				.map((r) => r.from)
		)
	];
	if (cuts.length === 0 || set.size === 0) return set;
	const out: Range<Decoration>[] = [];
	for (let it = set.iter(); it.value; it.next()) {
		let from = it.from;
		for (const cut of cuts.filter((c) => c > it.from && c < it.to).sort((a, b) => a - b)) {
			out.push(it.value.range(from, cut));
			from = cut;
		}
		out.push(it.value.range(from, it.to));
	}
	return Decoration.set(out, true);
}

function struckAt(state: EditorState, at: number): SuggestionRange[] {
	return liveSuggestionRanges(state).filter((r) => r.restore && r.from === at);
}

function stepAtOldWords(forward: boolean) {
	return (view: EditorView): boolean => {
		const { state } = view;
		const sel = state.selection;
		if (sel.ranges.length > 1 || !sel.main.empty) return false;
		const here = sel.main.head;
		const want: TypingSide = forward ? 'after' : 'before';
		const struck = struckAt(state, here);
		if (struck.length && sideAtOldWords(state.field(caretSide, false) ?? null, here, struck.map(typingSide)) !== want) {
			view.dispatch({ effects: setCaretSide.of({ at: here, side: want }) });
			return true;
		}
		const next = view.moveByChar(sel.main, forward).head;
		if (next === here || struckAt(state, next).length === 0) return false;
		view.dispatch({
			selection: EditorSelection.cursor(next),
			effects: setCaretSide.of({ at: next, side: forward ? 'before' : 'after' }),
			scrollIntoView: true,
			userEvent: 'select'
		});
		return true;
	};
}

const caretControls = [
	Prec.high(
		keymap.of([
			{ key: 'ArrowLeft', run: stepAtOldWords(false) },
			{ key: 'ArrowRight', run: stepAtOldWords(true) }
		])
	),
	EditorView.domEventHandlers({
		click(e, view) {
			const sel = view.state.selection.main;
			const ids = new Set(sel.empty ? struckAt(view.state, sel.head).map((r) => r.id) : []);
			if (ids.size === 0) return false;
			const words = [...view.contentDOM.querySelectorAll<HTMLElement>('.cm-suggest-old')].filter((el) => ids.has(el.dataset.comment ?? ''));
			const side = clickedSide(words, e.clientX, e.clientY);
			if (side) view.dispatch({ effects: setCaretSide.of({ at: sel.head, side }) });
			return false;
		}
	})
];

// the reader's own edits only: a collaborator's arrives without a user event
const editedPlaces = EditorView.updateListener.of((u) => {
	if (!u.docChanged || !u.transactions.some((tr) => tr.annotation(Transaction.userEvent) !== undefined)) return;
	const changes: TextChange[] = [];
	u.changes.iterChangedRanges((fromA, toA, fromB, toB) => void changes.push({ fromA, toA, fromB, toB }));
	if (changes.length > 1) noteEditedPlaces({ before: docText(u.startState.doc), after: docText(u.state.doc), changes });
});

export function cmSuggestions(): Extension {
	return [focused, caretSide, ranges, decorations, caretControls, editedPlaces, theme];
}

const theme = EditorView.baseTheme({
	'.cm-suggest-new': {
		backgroundColor: 'color-mix(in srgb, var(--diff-insert-tint) 18%, transparent)'
	},
	'.cm-suggest-old': {
		backgroundColor: 'color-mix(in srgb, var(--diff-delete-tint) 16%, transparent)',
		textDecoration: 'line-through',
		color: 'color-mix(in srgb, currentColor 70%, transparent)'
	},
	'.cm-suggest-new.cm-suggest-focused': {
		backgroundColor: 'color-mix(in srgb, var(--diff-insert-tint) 34%, transparent)'
	},
	'.cm-suggest-old.cm-suggest-focused': {
		backgroundColor: 'color-mix(in srgb, var(--diff-delete-tint) 30%, transparent)'
	}
});
