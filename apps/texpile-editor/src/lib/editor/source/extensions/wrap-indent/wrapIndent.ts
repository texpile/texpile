import { countColumn, StateEffect, type ChangeSet, type Range, type Text } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';

export const TYPST_LIST_MARKER = /^[ \t]*(?:[-+/]|\d+\.)[ \t]+/;
export const MARKDOWN_LIST_MARKER = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/;

// the left padding SourceEditor.svelte gives every .cm-line, which this style replaces
const LINE_PADDING = '2px';

const setCap = StateEffect.define<number>();
const indentByColumns = new Map<number, Decoration>();

/** the column a wrapped row of this line starts at */
export function wrapColumns(text: string, tabSize: number, marker: RegExp | null): number {
	const prefix = marker?.exec(text)?.[0] ?? /^[ \t]*/.exec(text)?.[0] ?? '';
	return countColumn(prefix, tabSize);
}

function indentDecoration(columns: number): Decoration {
	let decoration = indentByColumns.get(columns);
	if (!decoration) {
		decoration = Decoration.line({
			attributes: { style: `padding-left: calc(${LINE_PADDING} + ${columns}ch); text-indent: -${columns}ch` }
		});
		indentByColumns.set(columns, decoration);
	}
	return decoration;
}

/** the deepest indent seen, uncapped: a narrower editor changes nothing while the cap stays above it */
export class WidestIndent {
	columns = 0;
	see(columns: number): void {
		if (columns > this.columns) this.columns = columns;
	}
}

function lineIndent(text: string, from: number, tabSize: number, marker: RegExp | null, cap: number, widest?: WidestIndent) {
	const full = wrapColumns(text, tabSize, marker);
	widest?.see(full);
	const columns = Math.min(full, cap);
	return columns > 0 ? indentDecoration(columns).range(from) : null;
}

/** the whole document, so a row never shifts as it scrolls into view */
export function buildWrapIndents(doc: Text, tabSize: number, marker: RegExp | null, cap: number, widest?: WidestIndent): DecorationSet {
	const ranges: Range<Decoration>[] = [];
	let from = 0;
	for (const text of doc.iterLines()) {
		const range = lineIndent(text, from, tabSize, marker, cap, widest);
		if (range) ranges.push(range);
		from += text.length + 1;
	}
	return Decoration.set(ranges);
}

export function updateWrapIndents(
	indents: DecorationSet,
	changes: ChangeSet,
	before: Text,
	after: Text,
	tabSize: number,
	marker: RegExp | null,
	cap: number,
	widest?: WidestIndent
): DecorationSet {
	const stale = new Set<number>();
	const redone = new Set<number>();
	const add: Range<Decoration>[] = [];
	let filterFrom = before.length;
	let filterTo = 0;
	changes.iterChangedRanges((fromA, toA, fromB, toB) => {
		for (let n = before.lineAt(fromA).number; n <= before.lineAt(toA).number; n++) {
			const from = before.line(n).from;
			stale.add(from);
			filterFrom = Math.min(filterFrom, from);
			filterTo = Math.max(filterTo, from);
		}
		for (let n = after.lineAt(fromB).number; n <= after.lineAt(toB).number; n++) {
			if (redone.has(n)) continue;
			redone.add(n);
			const line = after.line(n);
			const range = lineIndent(line.text, line.from, tabSize, marker, cap, widest);
			if (range) add.push(range);
		}
	});
	return indents
		.update({ filter: (from) => !stale.has(from), filterFrom, filterTo })
		.map(changes)
		.update({ add, sort: true });
}

/** wrapped rows start under their line's text, at most half the editor's width in */
export function wrapIndent(marker: RegExp | null) {
	const plugin = ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			cap = Infinity;
			widest = new WidestIndent();
			destroyed = false;
			readonly measureCap = {
				key: this,
				read: (view: EditorView) => Math.floor(view.contentDOM.clientWidth / view.defaultCharacterWidth / 2),
				// a dispatch is not allowed inside the measure cycle
				write: (cap: number, view: EditorView) => {
					if (cap !== this.cap) setTimeout(() => this.destroyed || view.dispatch({ effects: setCap.of(cap) }));
				}
			};

			constructor(view: EditorView) {
				this.decorations = buildWrapIndents(view.state.doc, view.state.tabSize, marker, this.cap, this.widest);
				view.requestMeasure(this.measureCap);
			}

			update(update: ViewUpdate) {
				const { state } = update;
				let cap: number | undefined;
				for (const tr of update.transactions) for (const effect of tr.effects) if (effect.is(setCap)) cap = effect.value;
				const tabs = state.tabSize !== update.startState.tabSize;
				const reaches = cap !== undefined && Math.min(cap, this.widest.columns) !== Math.min(this.cap, this.widest.columns);
				this.cap = cap ?? this.cap;
				if (tabs || reaches) {
					this.widest = new WidestIndent();
					this.decorations = buildWrapIndents(state.doc, state.tabSize, marker, this.cap, this.widest);
				} else if (update.docChanged) {
					this.decorations = updateWrapIndents(
						this.decorations,
						update.changes,
						update.startState.doc,
						state.doc,
						state.tabSize,
						marker,
						this.cap,
						this.widest
					);
				}
				if (update.geometryChanged) update.view.requestMeasure(this.measureCap);
			}

			destroy() {
				this.destroyed = true;
			}
		},
		{ decorations: (indents) => indents.decorations }
	);
	// text-indent inherits, and an inline-block widget inside the line would take it
	return [plugin, EditorView.baseTheme({ '.cm-line *': { textIndent: '0' } })];
}
