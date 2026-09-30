// @vitest-environment jsdom
// Enter in Typst source: which lines it continues, with what, and where it keeps its hands off.
// `|` marks the caret, before and after.
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { ensureSyntaxTree } from '@codemirror/language';
import { typstLanguage } from '$lib/languages/typst/source/typstLanguage';
import { typstEnter } from '$lib/languages/typst/source/enterContinuation';

/** the document after Enter, caret marked; null when Enter is left to its default */
function enter(withCaret: string): string | null {
	const pos = withCaret.indexOf('|');
	const doc = withCaret.slice(0, pos) + withCaret.slice(pos + 1);
	const state = EditorState.create({ doc, selection: { anchor: pos }, extensions: [typstLanguage()] });
	ensureSyntaxTree(state, doc.length, 5000);
	const spec = typstEnter(state);
	if (!spec) return null;
	const next = state.update(spec).state;
	const head = next.selection.main.head;
	const text = next.doc.toString();
	return text.slice(0, head) + '|' + text.slice(head);
}

describe('lists', () => {
	it('opens the next item of the same kind', () => {
		expect(enter('- one|')).toBe('- one\n- |');
		expect(enter('+ one|')).toBe('+ one\n+ |');
	});

	it('counts an explicitly numbered item on', () => {
		expect(enter('9. nine|')).toBe('9. nine\n10. |');
	});

	it('opens a term item with its marker, for the next term', () => {
		expect(enter('/ Term: its description|')).toBe('/ Term: its description\n/ |');
	});

	it('keeps a nested item at its own depth', () => {
		expect(enter('- a\n  - nested|')).toBe('- a\n  - nested\n  - |');
	});

	it('continues from a wrapped line of the item, at the marker line', () => {
		expect(enter('- one\n  more|')).toBe('- one\n  more\n- |');
	});

	it('splits an item at the caret, carrying the rest into the new one', () => {
		expect(enter('- first second|'.replace(' second|', '| second'))).toBe('- first\n- |second');
	});

	it('works for a list inside a content block', () => {
		expect(enter('#let x = [\n  - in content|\n]')).toBe('#let x = [\n  - in content\n  - |\n]');
	});

	it('ends the list on an empty item instead of adding another', () => {
		expect(enter('- one\n- |')).toBe('- one\n|');
		expect(enter('- one\n  - |')).toBe('- one\n  |');
	});

	it('leaves the term itself alone, and a caret before the marker', () => {
		expect(enter('/ Te|rm: desc')).toBeNull();
		expect(enter('|- one')).toBeNull();
	});

	it('keeps a term whose description is still to come', () => {
		expect(enter('/ Term:|')).toBeNull();
		expect(enter('/ :|')).toBe('|');
	});

	it('keeps out of raw text, strings, math and function arguments', () => {
		expect(enter('```\n- raw|\n```')).toBeNull();
		expect(enter('#let s = "- str|"')).toBeNull();
		expect(enter('- see $x|$')).toBeNull();
		expect(enter('- #strong[bold|]')).toBeNull();
	});

	it('never splits strong or emphasised text, a label, a reference or a link', () => {
		expect(enter('- *bo|ld*')).toBeNull();
		expect(enter('- _em|ph_')).toBeNull();
		expect(enter('- a <lab|el>')).toBeNull();
		expect(enter('- see @re|f')).toBeNull();
		expect(enter('- https://exa|mple.com')).toBeNull();
	});

	it('continues after math, raw text or a call that closes the item', () => {
		expect(enter('- see $x$|')).toBe('- see $x$\n- |');
		expect(enter('- `raw`|')).toBe('- `raw`\n- |');
		expect(enter('- #emph[x]|')).toBe('- #emph[x]\n- |');
		expect(enter('- *bold*|')).toBe('- *bold*\n- |');
		// never closed, it runs on past the caret
		expect(enter('- see $x|')).toBeNull();
	});

	it('does nothing for plain paragraphs and headings', () => {
		expect(enter('Just text|')).toBeNull();
		expect(enter('= Heading|')).toBeNull();
	});
});

describe('comments', () => {
	it('always continues a doc comment', () => {
		expect(enter('/// Adds two numbers.|')).toBe('/// Adds two numbers.\n/// |');
		expect(enter('  //! Module docs|')).toBe('  //! Module docs\n  //! |');
	});

	it('continues a plain comment it splits, or one left with a trailing space', () => {
		expect(enter('// one| two')).toBe('// one\n// |two');
		expect(enter('// still typing |')).toBe('// still typing \n// |');
	});

	it('leaves a finished plain comment to a plain newline', () => {
		expect(enter('// done|')).toBeNull();
	});

	it('ends a comment run on an empty comment line', () => {
		expect(enter('/// Docs\n/// |')).toBe('/// Docs\n|');
	});

	it('leaves a comment after code alone', () => {
		expect(enter('#let x = 1 /// trailing|')).toBeNull();
	});
});

describe('equations', () => {
	it('opens an empty equation into a display block', () => {
		expect(enter('$|$')).toBe('$\n  |\n$');
		expect(enter('  $ | $')).toBe('  $\n    |\n  $');
	});

	it('leaves an equation with something in it alone', () => {
		expect(enter('$ x + y| $')).toBeNull();
	});
});

it('declines with a selection or several carets', () => {
	const state = EditorState.create({ doc: '- one', selection: { anchor: 2, head: 5 }, extensions: [typstLanguage()] });
	ensureSyntaxTree(state, 5, 5000);
	expect(typstEnter(state)).toBeNull();
});
