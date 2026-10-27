// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { latex } from '$lib/languages/latex/source/latexLanguage';
import { latexOwnMath } from '$lib/languages/latex/source/latexOwnMath';

afterEach(() => vi.useRealTimers());

it('parses the math shortcuts the document defines once it has been scanned', () => {
	vi.useFakeTimers();
	const doc = '\\newcommand{\\be}{\\begin{equation}}\n\\newcommand{\\ee}{\\end{equation}}\n\\begin{document}\n\\be x \\ee\n';
	const view = new EditorView({ state: EditorState.create({ doc, extensions: [latex(), latexOwnMath()] }), parent: document.body });
	try {
		const ownMath = () => syntaxTree(view.state).resolveInner(doc.indexOf(' x ') + 1).parent?.name;
		expect(ownMath()).not.toBe('OwnMath');
		vi.advanceTimersByTime(1000);
		expect(ownMath()).toBe('OwnMath');
	} finally {
		view.destroy();
	}
});
