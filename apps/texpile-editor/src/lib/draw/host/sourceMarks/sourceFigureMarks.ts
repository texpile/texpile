import { RangeSet, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, ViewPlugin, gutterLineClass, type DecorationSet } from '@codemirror/view';
import { samePath } from '$lib/workspace/fileSystem';
import { jumpRevealEffect } from '$lib/editor/source/cmJumpReveal';
import { figuresOn, onFiguresChange } from '../anchor/openFigures.svelte';
import { editFigureChip } from './editFigureChip';

type FigureMarks = { lines: DecorationSet; numbers: RangeSet<GutterMarker> };

const SET_MARKS = StateEffect.define<FigureMarks>();
const STATEMENT_LINE = Decoration.line({ class: 'cm-figure-statement' });

class FigureGutterMark extends GutterMarker {
	constructor(override readonly elementClass: string) {
		super();
	}
}
const PICTURE_NUMBER = new FigureGutterMark('cm-figure-picture-number');
const STATEMENT_NUMBER = new FigureGutterMark('cm-figure-picture-number cm-figure-statement-number');

function linesOf(state: EditorState, from: number, to: number): number[] {
	const end = Math.min(to, state.doc.length);
	const starts: number[] = [];
	for (let line = state.doc.lineAt(Math.min(from, end)); ; line = state.doc.line(line.number + 1)) {
		starts.push(line.from);
		if (line.to >= end || line.number === state.doc.lines) return starts;
	}
}

function marksOf(state: EditorState, path: string): FigureMarks {
	const lines: ReturnType<typeof STATEMENT_LINE.range>[] = [];
	const numbers = new Map<number, FigureGutterMark>();
	for (const [, figure] of figuresOn(path, samePath)) {
		const picture = figure.picture;
		if (!picture || picture.to > state.doc.length) continue;
		const lit = new Set(figure.selected.flatMap((r) => linesOf(state, r.from, r.to)));
		for (const at of linesOf(state, picture.from, picture.to)) {
			if (lit.has(at)) lines.push(STATEMENT_LINE.range(at));
			numbers.set(at, lit.has(at) ? STATEMENT_NUMBER : PICTURE_NUMBER);
		}
	}
	return {
		lines: Decoration.set(lines, true),
		numbers: RangeSet.of(
			[...numbers].sort(([a], [b]) => a - b).map(([at, mark]) => mark.range(at)),
			true
		)
	};
}

const marksField = StateField.define<FigureMarks>({
	create: () => ({ lines: Decoration.none, numbers: RangeSet.empty }),
	update(marks, tr) {
		for (const e of tr.effects) if (e.is(SET_MARKS)) return e.value;
		return tr.docChanged ? { lines: marks.lines.map(tr.changes), numbers: marks.numbers.map(tr.changes) } : marks;
	},
	provide: (f) => [EditorView.decorations.from(f, (m) => m.lines), gutterLineClass.from(f, (m) => m.numbers)]
});

function follower(path: string) {
	return ViewPlugin.define((view) => {
		let shownSelection = '';
		function refresh(): void {
			if (view.dom.isConnected === false) return;
			const marks = marksOf(view.state, path);
			const open = figuresOn(path, samePath);
			const selected = open.flatMap(([, f]) => f.selected);
			// what is picked, measured from its picture: typing above the picture moves it without picking anything new
			const key = JSON.stringify(
				open.map(([id, f]) => [id, f.selected.map((r) => [r.from - (f.picture?.from ?? 0), r.to - (f.picture?.from ?? 0)])])
			);
			const reveal = key !== shownSelection && selected.length && selected[0].from <= view.state.doc.length;
			shownSelection = key;
			view.dispatch({ effects: [SET_MARKS.of(marks), ...(reveal ? [jumpRevealEffect(view, selected[0].from)] : [])] });
		}
		queueMicrotask(refresh);
		const stop = onFiguresChange(() => queueMicrotask(refresh));
		return { destroy: stop };
	});
}

const theme = EditorView.baseTheme({
	'.cm-figure-picture-number': { backgroundColor: 'var(--primary-tint)', color: 'var(--primary-ink)' },
	'.cm-figure-statement': { backgroundColor: 'color-mix(in oklab, var(--color-surface-500) 16%, transparent)' },
	'.cm-figure-statement-number': {
		backgroundColor: 'color-mix(in oklab, var(--color-primary-500) 32%, transparent)',
		fontWeight: '600'
	},
	'.cm-figure-chip': { marginLeft: '10px', verticalAlign: 'middle', fontFamily: 'var(--font-sans, system-ui, sans-serif)' }
});

export function sourceFigureMarks(path: string): Extension {
	return [marksField, follower(path), editFigureChip(path), theme];
}
