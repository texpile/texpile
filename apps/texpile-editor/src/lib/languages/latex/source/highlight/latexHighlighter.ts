import { highlightingFor, syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
import { KIND_TAGS, latexSpans } from './latexSpans';

const marks = new Map<string, Decoration>();

function markOf(cls: string): Decoration {
	let mark = marks.get(cls);
	if (!mark) marks.set(cls, (mark = Decoration.mark({ class: cls })));
	return mark;
}

function paint(view: EditorView): DecorationSet {
	const { state } = view;
	const tree = syntaxTree(state);
	function read(from: number, to: number): string {
		return state.doc.sliceString(from, to);
	}
	const builder = new RangeSetBuilder<Decoration>();
	let done = 0;
	for (const range of view.visibleRanges) {
		const from = Math.max(done, state.doc.lineAt(range.from).from);
		const to = Math.min(state.doc.lineAt(range.to).to, tree.length);
		if (from >= to) continue;
		for (const span of latexSpans(tree, read, from, to)) {
			const cls = highlightingFor(state, [KIND_TAGS[span.kind]]);
			if (cls) builder.add(span.from, span.to, markOf(cls));
		}
		done = to;
	}
	return builder.finish();
}

export const latexHighlighter = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		constructor(view: EditorView) {
			this.decorations = paint(view);
		}
		update(update: ViewUpdate) {
			if (
				update.docChanged ||
				update.viewportChanged ||
				syntaxTree(update.state) !== syntaxTree(update.startState) ||
				update.transactions.some((tr) => tr.reconfigured)
			)
				this.decorations = paint(update.view);
		}
	},
	{ decorations: (plugin) => plugin.decorations }
);
