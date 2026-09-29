// Lines changed since the last saved version, marked in the margin: VS Code's quick-diff bars.
// Green where lines were added, blue where they were changed, and a red wedge between two lines
// where some were removed. Alt+F5 and Shift+Alt+F5 go to the next and previous change. Clicking a
// mark opens what those lines were in the last version beneath them, with Undo this change: VS
// Code's dirty-diff peek and its Revert Change.
//
// The last version's text arrives from outside (the editor has no git of its own) through
// setChangeBaseline; null turns the markers off, which is what a file with no saved version gets.
import { Decoration, EditorView, GutterMarker, WidgetType, gutter, keymap, type Command } from '@codemirror/view';
import {
	EditorSelection,
	RangeSet,
	StateEffect,
	StateField,
	Text,
	type EditorState,
	type Extension,
	type Range,
	type TransactionSpec
} from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import { Chunk } from '@codemirror/merge';
import { m } from '$lib/paraglide/messages';

export const setChangeBaseline = StateEffect.define<string | null>();

type Diff = { base: Text | null; chunks: readonly Chunk[] };

// a long, very different file falls back to a coarser diff rather than stall a keystroke
const DIFF = { scanLimit: 1000, timeout: 40 };

export const changeDiff = StateField.define<Diff>({
	create: () => ({ base: null, chunks: [] }),
	update(value, tr) {
		for (const e of tr.effects) {
			if (!e.is(setChangeBaseline)) continue;
			const base = e.value === null ? null : Text.of(e.value.split('\n'));
			return { base, chunks: base ? Chunk.build(base, tr.state.doc, DIFF) : [] };
		}
		if (!value.base || !tr.docChanged) return value;
		return { base: value.base, chunks: Chunk.updateB(value.chunks, value.base, tr.state.doc, tr.changes, DIFF) };
	}
});

export type ChangeKind = 'added' | 'modified' | 'removed';

const NO_DIFF: Diff = { base: null, chunks: [] };
/** the diff, or none where the extension is left out (a read-only editor): the palette's change
 *  commands still reach that editor */
function diffOf(state: EditorState): Diff {
	return state.field(changeDiff, false) ?? NO_DIFF;
}

type ChangeLines = { kind: ChangeKind; from: number; to: number; old: string | null };

/** A chunk as lines, less the lines both sides share at its edges. Typing lines after a file's
 *  closing blank line is a chunk that swaps that blank line for itself plus the new ones: marked
 *  changed, and peeked as a blank line taken away, where the lines were only added. Null when
 *  nothing is left. */
function linesOf(doc: Text, base: Text, c: Chunk): ChangeLines | null {
	const was = c.fromA === c.toA ? [] : base.sliceString(c.fromA, c.endA).split('\n');
	const now = c.fromB === c.toB ? [] : doc.sliceString(c.fromB, c.endB).split('\n');
	let head = 0;
	while (head < was.length && head < now.length && was[head] === now[head]) head++;
	let tail = 0;
	while (tail < was.length - head && tail < now.length - head && was.at(-1 - tail) === now.at(-1 - tail)) tail++;
	const old = was.slice(head, was.length - tail);
	const added = now.length - head - tail;
	if (!old.length && !added) return null;
	const kind: ChangeKind = !added ? 'removed' : !old.length ? 'added' : 'modified';
	const from = Math.min(doc.lineAt(Math.min(c.fromB, doc.length)).number + head, doc.lines);
	return { kind, from, to: kind === 'removed' ? from : from + added - 1, old: old.length ? old.join('\n') : null };
}

/** each chunk as the lines it marks in the editor's document: exported for the tests */
export function changedLines(state: EditorState): { kind: ChangeKind; from: number; to: number }[] {
	const { base, chunks } = diffOf(state);
	if (!base) return [];
	return chunks.flatMap((c) => {
		const l = linesOf(state.doc, base, c);
		return l ? [{ kind: l.kind, from: l.from, to: l.to }] : [];
	});
}

class ChangeMarker extends GutterMarker {
	constructor(readonly kind: ChangeKind) {
		super();
	}
	override eq(other: ChangeMarker): boolean {
		return other.kind === this.kind;
	}
	// eslint-disable-next-line @typescript-eslint/naming-convention -- @codemirror GutterMarker API method
	override toDOM(): Node {
		const el = document.createElement('div');
		el.className = `cm-change-mark cm-change-${this.kind}`;
		const what =
			this.kind === 'added' ? m.editor_change_added() : this.kind === 'modified' ? m.editor_change_modified() : m.editor_change_removed();
		el.title = `${what}\n${m.editor_change_click()}`;
		return el;
	}
}

const MARKS = { added: new ChangeMarker('added'), modified: new ChangeMarker('modified'), removed: new ChangeMarker('removed') };

function markers(view: EditorView): RangeSet<GutterMarker> {
	const doc = view.state.doc;
	const out: Range<GutterMarker>[] = [];
	for (const c of changedLines(view.state)) {
		for (let n = c.from; n <= c.to; n++) out.push(MARKS[c.kind].range(doc.line(n).from));
	}
	return RangeSet.of(out, true);
}

/** the change after (or before) the caret's line, wrapping round the document */
function jump(dir: 1 | -1): Command {
	return (view) => {
		const changes = changedLines(view.state);
		if (!changes.length) return false;
		const here = view.state.doc.lineAt(view.state.selection.main.head).number;
		const next =
			dir === 1 ? (changes.find((c) => c.from > here) ?? changes[0]) : ([...changes].reverse().find((c) => c.to < here) ?? changes.at(-1)!);
		const at = view.state.doc.line(next.from).from;
		view.dispatch({ selection: EditorSelection.cursor(at), effects: EditorView.scrollIntoView(at, { y: 'center' }) });
		return true;
	};
}

export const nextChange = jump(1);
export const previousChange = jump(-1);

/** the change a position is in, or at the edge of */
function chunkAt(state: EditorState, pos: number): Chunk | undefined {
	return diffOf(state).chunks.find((c) => c.fromB <= pos && c.endB >= pos);
}

/** Put the lines of the change at `pos` back as they were in the last version, as one undo step
 *  of its own; null when there is no change there. @codemirror/merge's rejectChunk, which works
 *  on the same chunks. */
export function revertChangeAt(state: EditorState, pos: number): TransactionSpec | null {
	const { base } = diffOf(state);
	const c = chunkAt(state, pos);
	if (!base || !c) return null;
	let insert = base.sliceString(c.fromA, Math.max(c.fromA, c.toA - 1));
	if (c.fromA !== c.toA && c.toB <= state.doc.length) insert += state.lineBreak;
	return {
		changes: { from: c.fromB, to: Math.min(state.doc.length, c.toB), insert },
		userEvent: 'revert',
		annotations: isolateHistory.of('full')
	};
}

/** the change under the caret, put back */
export function revertChange(view: EditorView): boolean {
	const spec = revertChangeAt(view.state, view.state.selection.main.head);
	if (!spec) return false;
	view.dispatch(spec);
	return true;
}

/** the change whose last-version lines are open beneath it, by where it starts; null for none */
export const setChangePeek = StateEffect.define<number | null>();

export const changePeek = StateField.define<number | null>({
	create: () => null,
	update(at, tr) {
		for (const e of tr.effects) {
			if (e.is(setChangePeek)) return e.value;
			if (e.is(setChangeBaseline)) return null;
		}
		if (at === null || !tr.docChanged) return at;
		// typed into, it stays open; undone, or edited back to what it was, it closes
		const moved = tr.changes.mapPos(at);
		return chunkAt(tr.state, moved) ? moved : null;
	}
});

class PeekWidget extends WidgetType {
	constructor(
		readonly old: string | null,
		readonly at: number
	) {
		super();
	}
	override eq(other: PeekWidget): boolean {
		return other.old === this.old && other.at === this.at;
	}
	// eslint-disable-next-line @typescript-eslint/naming-convention -- @codemirror WidgetType API method
	override toDOM(view: EditorView): HTMLElement {
		const box = document.createElement('div');
		box.className = 'cm-change-peek';
		const head = box.appendChild(document.createElement('div'));
		head.className = 'cm-change-peek-head';
		head.appendChild(document.createElement('span')).textContent = m.editor_change_peek_title();
		function button(label: string, cls: string, run: () => void): HTMLButtonElement {
			const b = head.appendChild(document.createElement('button'));
			b.type = 'button';
			b.className = cls;
			b.textContent = label;
			// the caret stays where it was: the editor keeps focus through the click
			b.addEventListener('mousedown', (e) => e.preventDefault());
			b.addEventListener('click', run);
			return b;
		}
		button(m.editor_change_undo(), 'cm-change-peek-undo', () => {
			const spec = revertChangeAt(view.state, this.at);
			if (spec) view.dispatch(spec);
			view.focus();
		});
		button('×', 'cm-change-peek-close', () => {
			view.dispatch({ effects: setChangePeek.of(null) });
			view.focus();
		}).setAttribute('aria-label', m.editor_change_peek_close());
		if (this.old === null) {
			const none = box.appendChild(document.createElement('div'));
			none.className = 'cm-change-peek-none';
			none.textContent = m.editor_change_peek_new();
		} else {
			const pre = box.appendChild(document.createElement('pre'));
			pre.className = 'cm-change-peek-old';
			pre.textContent = this.old;
		}
		return box;
	}
}

const peekDecorations = EditorView.decorations.compute([changePeek, changeDiff], (state) => {
	const at = state.field(changePeek);
	const { base } = state.field(changeDiff);
	const c = at === null ? undefined : chunkAt(state, at);
	if (!c || !base) return Decoration.none;
	const lines = linesOf(state.doc, base, c);
	if (!lines) return Decoration.none;
	const removed = lines.kind === 'removed';
	// under the changed lines; above the line removed ones were taken from in front of
	const pos = removed ? state.doc.line(lines.from).from : state.doc.line(lines.to).to;
	return Decoration.set([
		Decoration.widget({ widget: new PeekWidget(lines.old, c.fromB), block: true, side: removed ? -1 : 1 }).range(pos)
	]);
});

/** a click on a mark opens its change, and a second click closes it again */
function peekFromGutter(view: EditorView, line: { from: number; to: number }): boolean {
	const c = view.state.field(changeDiff).chunks.find((ch) => ch.fromB <= line.to && ch.endB >= line.from);
	if (!c) return false;
	const open = view.state.field(changePeek);
	const same = open !== null && chunkAt(view.state, open) === c;
	view.dispatch({ effects: setChangePeek.of(same ? null : c.fromB) });
	return true;
}

function closePeek(view: EditorView): boolean {
	if (view.state.field(changePeek) === null) return false;
	view.dispatch({ effects: setChangePeek.of(null) });
	return true;
}

const theme = EditorView.baseTheme({
	'.cm-change-gutter .cm-gutterElement': { padding: '0 1px 0 3px' },
	'.cm-change-mark': { width: '3px', height: '100%', cursor: 'pointer' },
	'.cm-change-peek': {
		margin: '2px 0 4px',
		border: '1px solid color-mix(in srgb, currentColor 18%, transparent)',
		borderRadius: '4px',
		overflow: 'hidden'
	},
	'.cm-change-peek-head': {
		display: 'flex',
		alignItems: 'center',
		gap: '8px',
		padding: '3px 6px',
		fontFamily: 'var(--font-sans, system-ui, sans-serif)',
		fontSize: '12px',
		backgroundColor: 'color-mix(in srgb, currentColor 6%, transparent)'
	},
	'.cm-change-peek-head > span': { flex: '1', color: 'color-mix(in srgb, currentColor 70%, transparent)' },
	'.cm-change-peek-head button': { borderRadius: '4px', padding: '1px 6px', cursor: 'pointer' },
	'.cm-change-peek-head button:hover': { backgroundColor: 'color-mix(in srgb, currentColor 12%, transparent)' },
	'.cm-change-peek-undo': { border: '1px solid color-mix(in srgb, currentColor 25%, transparent)' },
	// the lines as they were, in the editor's own font: they are source
	'.cm-change-peek-old': {
		margin: '0',
		padding: '4px 8px',
		maxHeight: '14em',
		overflow: 'auto',
		fontFamily: 'inherit',
		whiteSpace: 'pre-wrap',
		backgroundColor: 'color-mix(in srgb, var(--color-error-500) 10%, transparent)'
	},
	'.cm-change-peek-none': {
		padding: '4px 8px',
		fontFamily: 'var(--font-sans, system-ui, sans-serif)',
		fontSize: '12px',
		color: 'color-mix(in srgb, currentColor 70%, transparent)'
	},
	// the colours Source Control and the file tree give an added, changed and deleted file
	'.cm-change-added': { backgroundColor: 'var(--git-added)' },
	'.cm-change-modified': { backgroundColor: 'var(--git-modified)' },
	// removed lines leave no line to colour: a wedge at the top of the line they were above
	'.cm-change-removed': {
		width: '0',
		height: '0',
		borderTop: '4px solid transparent',
		borderBottom: '4px solid transparent',
		borderLeft: '5px solid var(--git-deleted)',
		transform: 'translateY(-4px)'
	}
});

export function cmChangeMarkers(): Extension {
	return [
		changeDiff,
		changePeek,
		peekDecorations,
		gutter({
			class: 'cm-change-gutter',
			markers,
			lineMarkerChange: (u) => u.startState.field(changeDiff) !== u.state.field(changeDiff),
			domEventHandlers: { mousedown: peekFromGutter }
		}),
		keymap.of([
			{ key: 'Alt-F5', run: nextChange },
			{ key: 'Shift-Alt-F5', run: previousChange },
			{ key: 'Escape', run: closePeek }
		]),
		theme
	];
}
