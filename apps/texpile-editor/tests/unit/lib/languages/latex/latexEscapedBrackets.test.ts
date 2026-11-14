// @vitest-environment jsdom
// \{ must stay \{: the auto-close exception keys off an odd run of backslashes before the caret
import { describe, it, expect } from 'vitest';
import { EditorState, Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { escapedAt } from '$lib/languages/latex/source/latexEscapedBrackets';
import { latex } from '$lib/languages/latex/source/latexLanguage';

describe('escapedAt', () => {
	it('is true after one backslash and false after an escaped backslash', () => {
		expect(escapedAt(Text.of(['\\']), 1)).toBe(true);
		expect(escapedAt(Text.of(['a\\']), 2)).toBe(true);
		expect(escapedAt(Text.of(['\\\\']), 2)).toBe(false);
		expect(escapedAt(Text.of(['\\\\\\']), 3)).toBe(true);
	});

	it('is false with no backslash, at the start, and across a line break', () => {
		expect(escapedAt(Text.of(['a']), 1)).toBe(false);
		expect(escapedAt(Text.of(['']), 0)).toBe(false);
		expect(escapedAt(Text.of(['\\', '']), 2)).toBe(false);
	});
});

/** `text` with the caret at `|`, after `keys` are typed there one by one as the editor's own input handlers take them */
function typed(text: string, keys: string): string {
	const state = EditorState.create({ doc: text.replace('|', ''), selection: { anchor: text.indexOf('|') }, extensions: [latex()] });
	const view = new EditorView({ state, parent: document.body });
	for (const key of keys) {
		const at = view.state.selection.main.head;
		const plain = (): ReturnType<EditorState['update']> =>
			view.state.update({ changes: { from: at, insert: key }, selection: { anchor: at + 1 } });
		if (!view.state.facet(EditorView.inputHandler).some((handle) => handle(view, at, at, key, plain))) view.dispatch(plain());
	}
	const head = view.state.selection.main.head;
	const out = view.state.doc.toString();
	view.destroy();
	return `${out.slice(0, head)}|${out.slice(head)}`;
}

// a formula being typed was left open until its closing $, and the live preview held every key in it
describe('a $ typed in LaTeX source', () => {
	it('takes its partner in prose and steps over it at the end of the formula', () => {
		expect(typed('The rate |', '$')).toBe('The rate $|$');
		expect(typed('The rate |', '$x$ is')).toBe('The rate $x$ is|');
	});

	it('stays one character after a backslash and as the second of $$', () => {
		expect(typed('costs \\|', '$5')).toBe('costs \\$5|');
		expect(typed('|', '$$x$$')).toBe('$$x$$|');
	});
});
