// A source editor of a file with a figure tab open: the picture's lines are tinted, with a chip back to the tab, and the
// statements selected on the canvas are lit, as the figure editor's own code pane lit them
import { RangeSet, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, ViewPlugin, WidgetType, gutterLineClass, type DecorationSet } from '@codemirror/view';
import { samePath } from '$lib/workspace/fileSystem';
import { SHOW_FIGURE, type FigureDetail } from '$lib/draw/host/card/figureEvents';
import { figuresOn, onFiguresChange } from '../anchor/openFigures.svelte';
import { m } from '$lib/paraglide/messages';

type FigureMarks = { lines: DecorationSet; numbers: RangeSet<GutterMarker> };

const SET_MARKS = StateEffect.define<FigureMarks>();
const PICTURE_LINE = Decoration.line({ class: 'cm-figure-open' });
const STATEMENT_LINE = Decoration.line({ class: 'cm-figure-open cm-figure-statement' });
const STATEMENT_NUMBER = new (class extends GutterMarker {
	override elementClass = 'cm-figure-statement-number';
})();

class FigureChip extends WidgetType {
	constructor(
		readonly figure: string,
		readonly number: number | null
	) {
		super();
	}
	override eq(other: FigureChip): boolean {
		return other.figure === this.figure && other.number === this.number;
	}
	// eslint-disable-next-line @typescript-eslint/naming-convention -- @codemirror WidgetType API method
	toDOM(): HTMLElement {
		const chip = document.createElement('button');
		chip.className = 'cm-figure-chip chip preset-tonal-primary [--chip-size:var(--text-xs)]';
		chip.textContent = this.number ? m.figure_open_chip({ number: this.number }) : m.figure_open_chip_unnumbered();
		chip.addEventListener('mousedown', (e) => e.preventDefault());
		chip.addEventListener('click', () => {
			const detail: FigureDetail = { figure: this.figure };
			window.dispatchEvent(new CustomEvent(SHOW_FIGURE, { detail }));
		});
		return chip;
	}
	override ignoreEvent(): boolean {
		return true;
	}
}

function linesOf(state: EditorState, from: number, to: number): number[] {
	const end = Math.min(to, state.doc.length);
	const starts: number[] = [];
	for (let line = state.doc.lineAt(Math.min(from, end)); ; line = state.doc.line(line.number + 1)) {
		starts.push(line.from);
		if (line.to >= end || line.number === state.doc.lines) return starts;
	}
}

function marksOf(state: EditorState, path: string): FigureMarks {
	const lines: ReturnType<typeof PICTURE_LINE.range>[] = [];
	const chips: ReturnType<typeof PICTURE_LINE.range>[] = [];
	const numbered = new Set<number>();
	for (const [id, figure] of figuresOn(path, samePath)) {
		const picture = figure.picture;
		if (!picture || picture.to > state.doc.length) continue;
		const lit = new Set(figure.selected.flatMap((r) => linesOf(state, r.from, r.to)));
		for (const at of linesOf(state, picture.from, picture.to)) {
			lines.push((lit.has(at) ? STATEMENT_LINE : PICTURE_LINE).range(at));
			if (lit.has(at)) numbered.add(at);
		}
		const first = state.doc.lineAt(picture.from);
		chips.push(Decoration.widget({ widget: new FigureChip(id, figure.number), side: 1 }).range(first.to));
	}
	return {
		lines: Decoration.set([...lines, ...chips], true),
		numbers: RangeSet.of(
			[...numbered].sort((a, b) => a - b).map((at) => STATEMENT_NUMBER.range(at)),
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
			const selected = figuresOn(path, samePath).flatMap(([, f]) => f.selected);
			const key = JSON.stringify(selected);
			// the canvas picked a statement: it comes into view, as the figure editor's code pane brought it
			const reveal = key !== shownSelection && selected.length && selected[0].from <= view.state.doc.length;
			shownSelection = key;
			view.dispatch({ effects: [SET_MARKS.of(marks), ...(reveal ? [EditorView.scrollIntoView(selected[0].from, { y: 'nearest' })] : [])] });
		}
		queueMicrotask(refresh);
		const stop = onFiguresChange(() => queueMicrotask(refresh));
		return { destroy: stop };
	});
}

const theme = EditorView.baseTheme({
	'.cm-figure-open': { backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 5%, transparent)' },
	'.cm-figure-statement': { backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 16%, transparent)' },
	'.cm-figure-statement-number': { color: 'var(--color-primary-500)', fontWeight: '600' },
	'.cm-figure-chip': { marginLeft: '10px', verticalAlign: 'middle', fontFamily: 'var(--font-sans, system-ui, sans-serif)' }
});

/** `path`: the file the editor shows */
export function sourceFigureMarks(path: string): Extension {
	return [marksField, follower(path), theme];
}
