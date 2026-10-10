// a call to a function the snippet files name as a wrapper reads as tagged text, and writes back
// as the call; any other call stays a raw chip
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { setCallWrappers } from '$lib/languages/typst/visual/callWrappers';

afterEach(() => setCallWrappers([]));

function callsIn(doc: PMNode): string[] {
	const found: string[] = [];
	doc.descendants((node) => {
		for (const mark of node.marks) if (mark.type.name === 'call') found.push(`${mark.attrs.name}(${mark.attrs.args}):${node.text}`);
	});
	return found;
}

describe('wrapper calls in the visual Typst editor', () => {
	it('reads a listed call as text and writes it back after an edit inside it', () => {
		setCallWrappers(['offen']);
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
		setCallWrappers(['offen']);
		const parsed = parseTypstFile('Check this part now.\n');
		const state = EditorState.create({ doc: parsed.doc });
		const from = 1 + 'Check '.length;
		const tr = state.tr.addMark(from, from + 'this part'.length, state.schema.marks.call.create({ name: 'offen', args: '' }));
		expect(serializeTypstFile(parsed, state.apply(tr).doc)).toBe('Check #offen[this part] now.\n');
	});
});
