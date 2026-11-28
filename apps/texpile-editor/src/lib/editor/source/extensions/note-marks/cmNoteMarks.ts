// TODO, FIXME, XXX and HACK in a comment stand out in the source
import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { noteMarkersIn } from './noteMarkers';

// LaTeX, Typst, Markdown
const COMMENTS = new Set(['Comment', 'LineComment', 'BlockComment', 'CommentBlock']);

const mark = Decoration.mark({ class: 'cm-note-marker' });

function paint(view: EditorView): DecorationSet {
	const { state } = view;
	const builder = new RangeSetBuilder<Decoration>();
	let done = 0;
	for (const range of view.visibleRanges) {
		syntaxTree(state).iterate({
			from: Math.max(range.from, done),
			to: range.to,
			enter(node) {
				if (!COMMENTS.has(node.name) || node.from < done) return;
				const text = state.doc.sliceString(node.from, node.to);
				for (const m of noteMarkersIn(text)) builder.add(node.from + m.at, node.from + m.at + m.word.length, mark);
				done = node.to;
				return false;
			}
		});
		done = Math.max(done, range.to);
	}
	return builder.finish();
}

const theme = EditorView.baseTheme({
	'.cm-note-marker': {
		fontWeight: '600',
		color: 'var(--color-warning-ink)',
		backgroundColor: 'color-mix(in srgb, var(--color-warning-500) 18%, transparent)',
		borderRadius: '2px'
	}
});

export function cmNoteMarks() {
	return [
		ViewPlugin.fromClass(
			class {
				decorations: DecorationSet;
				constructor(view: EditorView) {
					this.decorations = paint(view);
				}
				update(u: ViewUpdate) {
					if (u.docChanged || u.viewportChanged || syntaxTree(u.state) !== syntaxTree(u.startState)) this.decorations = paint(u.view);
				}
			},
			{ decorations: (p) => p.decorations }
		),
		theme
	];
}
