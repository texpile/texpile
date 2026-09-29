// The places a merge left marked in the file, drawn as two versions to choose between: this side's
// lines tinted one way, theirs another, and above each place a row of Keep mine / Keep theirs /
// Keep both. VS Code's merge-conflict decorations, in words that do not assume git.
//
// Each choice is one transaction and its own undo step. The marker lines stay as text: they are
// what is in the file, and hiding them would make deleting one by hand a surprise.
import { Decoration, EditorView, WidgetType, type Command, type DecorationSet } from '@codemirror/view';
import { EditorSelection, StateField, type EditorState, type Extension, type Range, type TransactionSpec } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import { presentableDiff } from '@codemirror/merge';
import { scanConflicts, resolveConflict, MARKER_LINE, type ConflictBlock, type ConflictChoice } from '$lib/workspace/scm/conflictMarkers';
import { m } from '$lib/paraglide/messages';

/** the marked places in the document, rescanned on every change: a file holds a handful at most,
 *  and a line walk costs nothing next to what a keystroke already does */
export const conflictBlocks = StateField.define<ConflictBlock[]>({
	create: (state) => scanConflicts(state.doc.iterLines()),
	update: (blocks, tr) => (tr.docChanged ? scanConflicts(tr.state.doc.iterLines()) : blocks)
});

/** Whether the file has held a whole conflict in this editor. Only then is a lone marker line one
 *  git left, the rest of a place settled by hand: elsewhere `=======` is the author's text. */
const mergeFile = StateField.define<boolean>({
	create: (state) => state.field(conflictBlocks).length > 0,
	update: (was, tr) => was || tr.state.field(conflictBlocks).length > 0
});

/** the change that settles one place: the whole block, markers and all, becomes the chosen lines */
export function chooseConflict(state: EditorState, block: ConflictBlock, choice: ConflictChoice): TransactionSpec {
	const insert = resolveConflict((a, b) => state.sliceDoc(a, b), block, choice);
	return {
		changes: { from: block.from, to: block.to, insert },
		selection: { anchor: block.from },
		scrollIntoView: true,
		userEvent: 'input.conflict',
		// its own undo step, never merged with the typing around it
		annotations: isolateHistory.of('full')
	};
}

/** Every place in the file settled the same way, as one undo step: VS Code's Accept All Current /
 *  Incoming / Both. The changes are all against the document as it is, so their order is free. */
export function chooseAllConflicts(state: EditorState, choice: ConflictChoice): TransactionSpec | null {
	const blocks = state.field(conflictBlocks, false) ?? [];
	if (!blocks.length) return null;
	return {
		changes: blocks.map((b) => ({ from: b.from, to: b.to, insert: resolveConflict((x, y) => state.sliceDoc(x, y), b, choice) })),
		userEvent: 'input.conflict',
		annotations: isolateHistory.of('full')
	};
}

/** the next (or previous) marked place after the caret's, wrapping round */
function jumpToConflict(dir: 1 | -1): Command {
	return (view) => {
		const blocks = view.state.field(conflictBlocks, false) ?? [];
		if (!blocks.length) return false;
		const head = view.state.selection.main.head;
		const next =
			dir === 1 ? (blocks.find((b) => b.from > head) ?? blocks[0]) : ([...blocks].reverse().find((b) => b.to <= head) ?? blocks.at(-1)!);
		view.dispatch({ selection: EditorSelection.cursor(next.from), effects: EditorView.scrollIntoView(next.from, { y: 'center' }) });
		return true;
	};
}

export const nextConflict = jumpToConflict(1);
export const previousConflict = jumpToConflict(-1);

const CHOICES: [ConflictChoice, () => string, () => string][] = [
	['mine', () => m.vcs_conflict_keep_mine(), () => m.vcs_conflict_keep_mine_tip()],
	['theirs', () => m.vcs_conflict_keep_theirs(), () => m.vcs_conflict_keep_theirs_tip()],
	['both', () => m.vcs_conflict_keep_both(), () => m.vcs_conflict_keep_both_tip()]
];

class ChoiceBar extends WidgetType {
	constructor(private readonly at: number) {
		super();
	}
	override eq(other: ChoiceBar): boolean {
		return other.at === this.at;
	}
	// eslint-disable-next-line @typescript-eslint/naming-convention -- @codemirror WidgetType API method
	toDOM(view: EditorView): HTMLElement {
		const bar = document.createElement('div');
		bar.className = 'cm-conflict-bar';
		bar.setAttribute('role', 'group');
		bar.setAttribute('aria-label', m.vcs_conflict_bar_aria());
		for (const [choice, label, tip] of CHOICES) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = `cm-conflict-choice cm-conflict-choice-${choice}`;
			button.textContent = label();
			button.title = tip();
			// the editor keeps its selection and focus until the choice lands
			button.addEventListener('mousedown', (e) => e.preventDefault());
			button.addEventListener('click', () => {
				// looked up at click time: typing above this place has moved it since the bar was drawn
				const at = view.posAtDOM(bar);
				const block = view.state.field(conflictBlocks, false)?.find((b) => b.from === at);
				if (!block) return;
				view.dispatch(chooseConflict(view.state, block, choice));
				view.focus();
			});
			bar.append(button);
		}
		return bar;
	}
	override ignoreEvent(): boolean {
		return true;
	}
}

/** a short name at the end of a marker line: whose lines start here */
class SideLabel extends WidgetType {
	constructor(
		private readonly text: string,
		private readonly side: 'mine' | 'theirs' | 'base'
	) {
		super();
	}
	override eq(other: SideLabel): boolean {
		return other.text === this.text && other.side === this.side;
	}
	// eslint-disable-next-line @typescript-eslint/naming-convention -- @codemirror WidgetType API method
	toDOM(): HTMLElement {
		const label = document.createElement('span');
		label.className = `cm-conflict-label cm-conflict-label-${this.side}`;
		label.textContent = this.text;
		return label;
	}
}

function theirsName(label: string): string {
	// git names the other side by ref ('refs/remotes/origin/main') or by commit ('1a2b3c4 (subject)')
	const name = label.replace(/^refs\/(?:remotes|heads)\//, '');
	return name ? m.vcs_conflict_theirs_named({ name }) : m.vcs_conflict_theirs();
}

function lineClasses(state: EditorState, span: { from: number; to: number }, cls: string, out: Range<Decoration>[]): void {
	if (span.to <= span.from) return;
	const deco = Decoration.line({ class: cls });
	// span.to sits just past the last line's break, which is the start of the next marker line
	for (let n = state.doc.lineAt(span.from).number, last = state.doc.lineAt(span.to - 1).number; n <= last; n++) {
		out.push(deco.range(state.doc.line(n).from));
	}
}

const dimmed = Decoration.mark({ class: 'cm-conflict-marker-text' });

/** a marker line: tinted as the side it opens, its text dimmed (not the label after it), and the
 *  label naming whose lines follow */
function markerLine(span: { from: number; to: number }, side: string, label: SideLabel | null, out: Range<Decoration>[]): void {
	out.push(Decoration.line({ class: `cm-conflict-marker cm-conflict-marker-${side}` }).range(span.from));
	if (span.to > span.from) out.push(dimmed.range(span.from, span.to));
	if (label) out.push(Decoration.widget({ widget: label, side: 1 }).range(span.to));
}

const differs = {
	mine: Decoration.mark({ class: 'cm-conflict-differs-mine' }),
	theirs: Decoration.mark({ class: 'cm-conflict-differs-theirs' })
};

/** Where the two sides actually differ, marked inside each: a rewording of one sentence in a long
 *  paragraph is otherwise a hunt through two near-identical blocks. A long place is left whole. */
function differences(state: EditorState, b: ConflictBlock, out: Range<Decoration>[]): void {
	const mine = state.sliceDoc(b.mine.from, b.mine.to);
	const theirs = state.sliceDoc(b.theirs.from, b.theirs.to);
	if (!mine || !theirs || mine.length + theirs.length > 20000) return;
	for (const c of presentableDiff(mine, theirs, { scanLimit: 500, timeout: 20 })) {
		if (c.toA > c.fromA) {
			const [from, to] = wholeWords(mine, c.fromA, c.toA);
			out.push(differs.mine.range(b.mine.from + from, b.mine.from + to));
		}
		if (c.toB > c.fromB) {
			const [from, to] = wholeWords(theirs, c.fromB, c.toB);
			out.push(differs.theirs.range(b.theirs.from + from, b.theirs.from + to));
		}
	}
}

const WORD = /[\p{L}\p{N}_]/u;

/** a changed stretch widened to the words it touches: "leaves" against "lattices" is a different
 *  word, not a shared "l" and two different endings */
function wholeWords(text: string, from: number, to: number): [number, number] {
	let start = from;
	let end = to;
	while (start > 0 && WORD.test(text[start - 1]) && WORD.test(text[start])) start--;
	while (end < text.length && end > 0 && WORD.test(text[end]) && WORD.test(text[end - 1])) end++;
	return [start, end];
}

function build(state: EditorState): DecorationSet {
	const out: Range<Decoration>[] = [];
	for (const b of state.field(conflictBlocks)) {
		differences(state, b, out);
		const { open, base, divider, close } = b.markers;
		out.push(Decoration.widget({ widget: new ChoiceBar(b.from), block: true, side: -1 }).range(b.from));
		markerLine(open, 'mine', new SideLabel(m.vcs_conflict_mine(), 'mine'), out);
		lineClasses(state, b.mine, 'cm-conflict-mine', out);
		if (base && b.base) {
			markerLine(base, 'base', new SideLabel(m.vcs_conflict_base(), 'base'), out);
			lineClasses(state, b.base, 'cm-conflict-base', out);
		}
		markerLine(divider, 'theirs', new SideLabel(theirsName(b.theirsLabel), 'theirs'), out);
		lineClasses(state, b.theirs, 'cm-conflict-theirs', out);
		markerLine(close, 'end', null, out);
	}
	if (state.field(mergeFile)) strayMarkers(state, out);
	return Decoration.set(out, true);
}

const strayLine = Decoration.line({ class: 'cm-conflict-stray' });

/** marker lines outside any whole place: what is left of one settled by hand. Complete Merge
 *  refuses the file while one is there, so it is marked where it is */
function strayMarkers(state: EditorState, out: Range<Decoration>[]): void {
	const text = state.doc.toString();
	if (!text.includes('<<<<<<<') && !text.includes('=======') && !text.includes('>>>>>>>')) return;
	const blocks = state.field(conflictBlocks);
	for (let n = 1; n <= state.doc.lines; n++) {
		const line = state.doc.line(n);
		if (!MARKER_LINE.test(line.text)) continue;
		if (blocks.some((b) => b.from <= line.from && line.from < b.to)) continue;
		out.push(strayLine.range(line.from));
	}
}

// block widgets have to come from a state field, not a view plugin
const decorations = StateField.define<DecorationSet>({
	create: build,
	update: (set, tr) => (tr.docChanged ? build(tr.state) : set),
	provide: (f) => EditorView.decorations.from(f)
});

const mineTint = 'var(--color-primary-500)';
const theirsTint = 'var(--color-secondary-500)';

const theme = EditorView.baseTheme({
	'.cm-conflict-mine': { backgroundColor: `color-mix(in srgb, ${mineTint} 10%, transparent)` },
	'.cm-conflict-theirs': { backgroundColor: `color-mix(in srgb, ${theirsTint} 10%, transparent)` },
	'.cm-conflict-base': { backgroundColor: 'color-mix(in srgb, currentColor 5%, transparent)' },
	// a stronger wash of the side's own colour, and an underline for anyone who cannot tell tints apart
	'.cm-conflict-differs-mine': {
		backgroundColor: `color-mix(in srgb, ${mineTint} 28%, transparent)`,
		textDecoration: `underline 1px color-mix(in srgb, ${mineTint} 70%, transparent)`,
		textUnderlineOffset: '3px'
	},
	'.cm-conflict-differs-theirs': {
		backgroundColor: `color-mix(in srgb, ${theirsTint} 28%, transparent)`,
		textDecoration: `underline 1px color-mix(in srgb, ${theirsTint} 70%, transparent)`,
		textUnderlineOffset: '3px'
	},
	'.cm-conflict-marker-text': { color: 'color-mix(in srgb, currentColor 55%, transparent)' },
	'.cm-conflict-marker-mine': { backgroundColor: `color-mix(in srgb, ${mineTint} 22%, transparent)` },
	'.cm-conflict-marker-theirs, .cm-conflict-marker-end': { backgroundColor: `color-mix(in srgb, ${theirsTint} 22%, transparent)` },
	'.cm-conflict-marker-base': { backgroundColor: 'color-mix(in srgb, currentColor 10%, transparent)' },
	'.cm-conflict-stray': { backgroundColor: 'color-mix(in srgb, var(--color-error-500) 18%, transparent)' },
	// the sides are told apart by the tint of the line the label sits on, never by coloured words: a
	// pale theme colour as text on a light ground does not read
	'.cm-conflict-label': {
		marginLeft: '1.5ch',
		paddingLeft: '0.6ch',
		fontFamily: 'var(--font-sans, system-ui, sans-serif)',
		fontSize: '0.85em',
		fontWeight: '600'
	},
	'.cm-conflict-bar': {
		display: 'flex',
		gap: '4px',
		padding: '6px 0 2px',
		fontFamily: 'var(--font-sans, system-ui, sans-serif)',
		fontSize: '12px'
	},
	'.cm-conflict-choice': {
		border: '1px solid color-mix(in srgb, currentColor 25%, transparent)',
		borderRadius: '4px',
		padding: '1px 8px',
		background: 'transparent',
		color: 'inherit',
		cursor: 'pointer',
		font: 'inherit'
	},
	'.cm-conflict-choice:hover': { backgroundColor: 'color-mix(in srgb, currentColor 10%, transparent)' },
	'.cm-conflict-choice:focus-visible': { outline: '2px solid var(--color-primary-500)', outlineOffset: '1px' }
});

export function cmConflicts(): Extension {
	// no keys of its own, as VS Code leaves its Next and Previous Conflict unbound: the notice over
	// the file has them, and the obvious Alt+[ and Alt+] type quotation marks on a Mac keyboard
	return [conflictBlocks, mergeFile, decorations, theme];
}
