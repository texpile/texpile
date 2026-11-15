import type { CodeFold, TextSpan } from '../figure/figureLanguage';
import { cmFolding } from '../code/cmFolding';
import { jumpRevealEffect } from '$lib/editor/source/cmJumpReveal';
import { defaultKeymap, history, historyKeymap, indentWithTab, isolateHistory, redo, undo } from '@codemirror/commands';
import { Annotation, EditorState, RangeSet, StateEffect, StateField, Transaction, type Extension, type Text } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, gutterLineClass, keymap, lineNumbers, type DecorationSet } from '@codemirror/view';
import { cmDrawnSelection } from '$lib/editor/cmDrawnSelection';
import { cmSyntaxHighlight } from '../code/cmHighlight';
import { CM_THEME } from '../code/cmTheme';

const SET_STATEMENT_RANGES = StateEffect.define<TextSpan[]>();
const JOINED = Annotation.define<boolean>();
const STATEMENT_LINE = Decoration.line({ class: 'cm-tikz-statement' });
const STATEMENT_NUMBER = new (class extends GutterMarker {
	override elementClass = 'cm-tikz-statement-number';
})();

function statementLines(doc: Text, ranges: TextSpan[]) {
	const starts = new Set<number>();
	for (const r of ranges.filter((r) => r.to > r.from))
		for (let n = doc.lineAt(r.from).number; n <= doc.lineAt(r.to).number; n++) starts.add(doc.line(n).from);
	const sorted = [...starts].sort((a, b) => a - b);
	return {
		lines: Decoration.set(sorted.map((at) => STATEMENT_LINE.range(at))),
		numbers: RangeSet.of(sorted.map((at) => STATEMENT_NUMBER.range(at)))
	};
}

const STATEMENT_FIELD = StateField.define<{ lines: DecorationSet; numbers: RangeSet<GutterMarker> }>({
	create: () => ({ lines: Decoration.none, numbers: RangeSet.empty }),
	update(previous, tr) {
		let next = { lines: previous.lines.map(tr.changes), numbers: previous.numbers.map(tr.changes) };
		for (const e of tr.effects) if (e.is(SET_STATEMENT_RANGES)) next = statementLines(tr.state.doc, e.value);
		return next;
	},
	provide: (f) => [EditorView.decorations.from(f, (v) => v.lines), gutterLineClass.from(f, (v) => v.numbers)]
});

export type CodeChange = {
	source: string;
	docChanged: boolean;
	cursor: number | null;
	mapPos: (pos: number) => number | null;
	replaced: (from: number, to: number) => boolean;
};

export function createCodeDocument(
	initial: string,
	onUpdate: (change: CodeChange) => void,
	language: Extension[] = [],
	hostHistory?: { undo: () => void; redo: () => void },
	foldRanges: (source: string) => CodeFold[] = () => []
) {
	function asCommand(f: () => void) {
		return () => (f(), true);
	}
	const undoKeys = hostHistory
		? [
				{ key: 'Mod-z', run: asCommand(hostHistory.undo) },
				{ key: 'Mod-y', run: asCommand(hostHistory.redo) },
				{ key: 'Mod-Shift-z', run: asCommand(hostHistory.redo) }
			]
		: historyKeymap;
	const extensions: Extension[] = [
		lineNumbers(),
		// the cursor and selection colors reach only the drawn layer
		cmDrawnSelection(),
		hostHistory ? [] : history({ joinToEvent: (tr, adjacent) => tr.annotation(JOINED) ?? adjacent }),
		keymap.of([...undoKeys, ...defaultKeymap, indentWithTab]),
		...language,
		...cmFolding(foldRanges),
		cmSyntaxHighlight(),
		STATEMENT_FIELD,
		CM_THEME,
		EditorView.updateListener.of((u) => {
			const userMoved = u.transactions.some((tr) => tr.isUserEvent('select') || tr.isUserEvent('input') || tr.isUserEvent('delete'));
			if (!u.docChanged && !userMoved) return;
			onUpdate({
				source: u.state.doc.toString(),
				docChanged: u.docChanged,
				cursor: userMoved ? u.state.selection.main.head : null,
				// a position past the old text is in the canvas's new picture, which the code did not have
				mapPos: (pos) => (pos <= u.startState.doc.length ? u.changes.mapPos(pos, 1) : null),
				replaced: (from, to) => {
					let whole = false;
					u.changes.iterChangedRanges((fromA, toA) => (whole ||= fromA <= from && toA >= to));
					return whole;
				}
			});
		})
	];
	const view = new EditorView({ state: EditorState.create({ doc: initial, extensions }) });

	return {
		view,
		get text() {
			return view.state.doc.toString();
		},
		/** `joined` goes into the undo step before it, `first` starts a run, `outside` is another editor's */
		replace(next: string, step: 'own' | 'first' | 'joined' | 'outside' = 'own') {
			const prev = view.state.doc.toString();
			if (prev === next) return;
			let start = 0;
			while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
			let endPrev = prev.length;
			let endNext = next.length;
			while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
				endPrev--;
				endNext--;
			}
			view.dispatch({
				changes: { from: start, to: endPrev, insert: next.slice(start, endNext) },
				// the history joins only edits with no event of their own
				userEvent: step === 'joined' || step === 'outside' ? undefined : 'canvas',
				annotations:
					step === 'outside'
						? Transaction.addToHistory.of(false)
						: step === 'joined'
							? JOINED.of(true)
							: isolateHistory.of(step === 'first' ? 'before' : 'full')
			});
		},
		showStatements(ranges: TextSpan[], primary: TextSpan | null) {
			const effects: StateEffect<unknown>[] = [SET_STATEMENT_RANGES.of(ranges)];
			if (primary) effects.push(jumpRevealEffect(view, primary.from));
			view.dispatch({ effects });
		},
		revealLine(line: number) {
			const at = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines)).from;
			view.dispatch({ selection: { anchor: at }, effects: jumpRevealEffect(view, at) });
			view.focus();
		},
		reset(text: string) {
			view.setState(EditorState.create({ doc: text, extensions }));
			onUpdate({ source: text, docChanged: true, cursor: null, mapPos: () => null, replaced: () => true });
		},
		undo: () => undo(view),
		redo: () => redo(view),
		destroy: () => view.destroy()
	};
}

export type CodeDocument = ReturnType<typeof createCodeDocument>;
