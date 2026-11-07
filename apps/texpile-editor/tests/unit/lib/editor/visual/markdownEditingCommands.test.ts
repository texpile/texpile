import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection, NodeSelection, type Command } from 'prosemirror-state';
import { parseMarkdownFile } from '$lib/languages/markdown/visual/roundtrip';
import { toggleBlockQuote, insertHardBreak } from '$lib/editor/visual/helperCommands';
import { insertHorizontalRule } from '$lib/editor/visual/insert/insertRun';
import { createCodeBlock } from '$lib/editor/visual/extensions/codemirrorbridge/cmcommands';
import { gen } from '../../markdown/mdTestUtils';

function stateAt(md: string, word: string, end = true): EditorState {
	const doc = parseMarkdownFile(md).doc;
	let at = -1;
	doc.descendants((n, pos) => {
		if (at < 0 && n.isText && n.text!.includes(word)) at = pos + n.text!.indexOf(word) + (end ? word.length : 0);
	});
	return EditorState.create({ doc, selection: TextSelection.create(doc, at) });
}

function press(state: EditorState, command: Command): EditorState {
	let next = state;
	command(state, (tr) => (next = state.apply(tr)));
	return next;
}

const parentName = (state: EditorState) => state.selection.$from.node(-1).type.name;

describe('markdown block commands keep the caret in the new content', () => {
	it('a quote holds the caret, so a second press unquotes the same block', () => {
		const quoted = press(stateAt('Alpha\n\nBeta\n\nGamma\n', 'Beta'), toggleBlockQuote());
		expect(parentName(quoted)).toBe('blockquote');
		expect(press(quoted, toggleBlockQuote()).doc.childCount).toBe(3);
		expect(press(quoted, toggleBlockQuote()).doc.child(1).type.name).toBe('paragraph');
	});

	it('a selection over three paragraphs goes into one quote, every word kept', () => {
		const doc = parseMarkdownFile('Alpha\n\nBeta\n\nGamma\n').doc;
		const all = EditorState.create({ doc, selection: TextSelection.create(doc, 2, doc.content.size - 2) });
		const quoted = press(all, toggleBlockQuote()).doc;
		expect(quoted.childCount).toBe(1);
		expect(quoted.child(0).type.name).toBe('blockquote');
		expect(quoted.textBetween(0, quoted.content.size, '|')).toBe('Alpha|Beta|Gamma');
	});

	it('a code block holds the caret inside, not selected as a node', () => {
		const state = press(stateAt('Alpha\n\nBeta\n', 'Alpha', false), createCodeBlock());
		expect(state.selection).not.toBeInstanceOf(NodeSelection);
		expect(state.selection.$from.parent.type.name).toBe('code_block');
	});

	it('a rule leaves the caret in the paragraph after it, one made when none follows', () => {
		const mid = press(stateAt('Alpha\n\nBeta\n', 'Alpha'), insertHorizontalRule);
		expect(mid.selection.$from.parent.textContent).toBe('Beta');
		const last = press(stateAt('Alpha\n', 'Alpha'), insertHorizontalRule);
		expect(last.doc.childCount).toBe(3);
		expect(last.selection.$from.parent.type.name).toBe('paragraph');
		expect(last.selection.$from.parent.content.size).toBe(0);
	});

	it('Shift+Enter puts a hard break in the paragraph', () => {
		const state = press(stateAt('Alpha\n', 'Alpha'), insertHardBreak);
		expect(state.doc.child(0).lastChild!.type.name).toBe('hard_break');
	});
});

describe('a tilde fence', () => {
	it('is written with tildes again', () => {
		expect(gen('~~~\ncode\n~~~\n')).toBe('~~~\ncode\n~~~');
	});
});
