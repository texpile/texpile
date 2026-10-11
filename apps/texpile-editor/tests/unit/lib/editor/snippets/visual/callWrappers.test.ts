// a call to a function the snippet files name as a wrapper reads as tagged text, and writes back
// as the call; any other call stays a raw chip
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { setCallWrappers } from '$lib/editor/snippets/visual/callWrappers';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';

afterEach(() => {
	setCallWrappers('typst', []);
	setCallWrappers('latex', []);
});

function callsIn(doc: PMNode): string[] {
	const found: string[] = [];
	doc.descendants((node) => {
		for (const mark of node.marks)
			if (mark.type.name === 'call') found.push(`${mark.attrs.name}(${mark.attrs.args}):${node.text ?? node.type.name}`);
	});
	return found;
}

describe('wrapper calls in the visual Typst editor', () => {
	it('reads a listed call as text and writes it back after an edit inside it', () => {
		setCallWrappers('typst', ['offen']);
		const src = 'Check #offen(fill: red)[this part] now, #note[x] too.\n';
		const parsed = parseTypstFile(src);
		expect(callsIn(parsed.doc)).toEqual(['offen(fill: red):this part']);
		// an edit inside the wrapped text, so the paragraph is written from the document, not kept as it was read
		let at = 0;
		parsed.doc.descendants((node, pos) => {
			if (node.text === 'this part') at = pos + 4;
		});
		const state = EditorState.create({ doc: parsed.doc });
		const edited = state.apply(state.tr.insertText('!', at)).doc;
		expect(serializeTypstFile(parsed, edited)).toBe('Check #offen(fill: red)[this! part] now, #note[x] too.\n');
	});

	it('wraps a selection in the call it names', () => {
		setCallWrappers('typst', ['offen']);
		const parsed = parseTypstFile('Check this part now.\n');
		const state = EditorState.create({ doc: parsed.doc });
		const from = 1 + 'Check '.length;
		const tr = state.tr.addMark(from, from + 'this part'.length, state.schema.marks.call.create({ name: 'offen', args: '' }));
		expect(serializeTypstFile(parsed, state.apply(tr).doc)).toBe('Check #offen[this part] now.\n');
	});
});

describe('wrapper calls in the visual LaTeX editor', () => {
	it('reads a listed call as text and writes it back as one call after an edit inside it', () => {
		setCallWrappers('latex', ['offen']);
		const src = 'Check \\offen[who]{this \\textbf{part} \\cite{k}} now, \\note{x} too.\n';
		const parsed = parseLatexFile(src);
		expect(callsIn(parsed.doc)).toEqual(['offen(who):this ', 'offen(who):part', 'offen(who): ', 'offen(who):citation']);
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(src);
		let at = 0;
		parsed.doc.descendants((node, pos) => {
			if (node.text === 'this ') at = pos + 4;
		});
		const state = EditorState.create({ doc: parsed.doc });
		const edited = state.apply(state.tr.insertText('!', at)).doc;
		expect(serializeLatexFile(parsed, edited)).toBe('Check \\offen[who]{this! \\textbf{part} \\cite{k}} now, \\note{x} too.\n');
		// written afresh, as a pasted paragraph is: still one call around the bold and the citation
		expect(serializeToLatex(schema.nodeFromJSON(edited.toJSON()))).toContain('\\offen[who]{this! \\textbf{part} \\cite{k}}');
	});

	it('leaves a macro no snippet gives a look as a chip', () => {
		const parsed = parseLatexFile('Check \\offen{this part} now.\n');
		expect(callsIn(parsed.doc)).toEqual([]);
		const chips: string[] = [];
		parsed.doc.descendants((node) => {
			if (node.type.name === 'inline_latex') chips.push(node.textContent);
		});
		expect(chips).toEqual(['\\offen{this part}']);
	});
});
