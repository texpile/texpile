// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { continueList } from '../../../../../src/lib/languages/latex/source/listContinuation';

// End of the chain: the predicate is unit-tested next door, this checks the edit it produces
// and, just as importantly, that declining leaves the document untouched so Enter falls
// through to its normal behaviour.
function press(doc: string) {
	const pos = doc.indexOf('|');
	const view = new EditorView({ state: EditorState.create({ doc: doc.replace('|', ''), selection: { anchor: pos } }) });
	const handled = continueList(view);
	const out = view.state.doc.toString();
	const caret = view.state.selection.main.head;
	view.destroy();
	return { handled, out, caret };
}

describe('Enter inside a list item', () => {
	it('opens the next bullet and puts the caret after it', () => {
		const r = press('\\begin{itemize}\n\\item first bullet|\n\\end{itemize}');
		expect(r.handled).toBe(true);
		expect(r.out).toBe('\\begin{itemize}\n\\item first bullet\n\\item \n\\end{itemize}');
		expect(r.out.slice(0, r.caret).endsWith('\\item ')).toBe(true);
	});

	it('keeps the indentation of the item it continues', () => {
		const r = press('\\begin{itemize}\n  \\item indented bullet|\n\\end{itemize}');
		expect(r.out).toContain('\n  \\item ');
	});

	it('continues a wrapped item from its last line', () => {
		const r = press('\\begin{itemize}\n\\item a bullet whose text\n  wraps onto a second line|\n\\end{itemize}');
		expect(r.handled).toBe(true);
		expect(r.out).toContain('wraps onto a second line\n\\item ');
	});

	it('uses the innermost list when they nest', () => {
		const r = press('\\begin{itemize}\n\\item outer\n\\begin{enumerate}\n\\item inner|\n\\end{enumerate}\n\\end{itemize}');
		expect(r.handled).toBe(true);
		expect(r.out).toContain('\\item inner\n\\item ');
	});
});

describe('Enter declines, leaving the document alone', () => {
	const untouched = (doc: string) => {
		const r = press(doc);
		expect(r.handled).toBe(false);
		expect(r.out).toBe(doc.replace('|', ''));
	};

	it('on an item with nothing typed in it yet', () => {
		// pressing Enter on an empty bullet means "done with the list" everywhere else
		untouched('\\begin{itemize}\n\\item first\n\\item |\n\\end{itemize}');
	});

	it('in ordinary prose', () => {
		untouched('Just some prose here.|');
	});

	it('inside a tabular nested in the list', () => {
		untouched('\\begin{itemize}\n\\item table\n\\begin{tabular}{ll}\na & b|\n\\end{tabular}\n\\end{itemize}');
	});

	it('inside a verbatim block that prints a list', () => {
		untouched('\\begin{verbatim}\n\\begin{itemize}\n\\item printed not real|\n\\end{verbatim}');
	});

	it('when the list opener is commented out', () => {
		untouched('% \\begin{itemize}\n\\item not in a list|\n');
	});

	it('inside inline math', () => {
		untouched('\\begin{itemize}\n\\item value $x + y|\n\\end{itemize}');
	});

	it('after the list has closed', () => {
		untouched('\\begin{itemize}\n\\item first\n\\end{itemize}\n\nAfter the list.|');
	});

	it('with a selection rather than a caret', () => {
		const doc = '\\begin{itemize}\n\\item first bullet\n\\end{itemize}';
		const view = new EditorView({ state: EditorState.create({ doc, selection: { anchor: 16, head: 30 } }) });
		expect(continueList(view)).toBe(false);
		expect(view.state.doc.toString()).toBe(doc);
		view.destroy();
	});
});
