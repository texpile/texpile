import { describe, it, expect } from 'vitest';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';

function blocks(latex: string): { type: string; text: string }[] {
	const out: { type: string; text: string }[] = [];
	treeToProseMirror(latex, {}).doc.forEach((n) => out.push({ type: n.type.name, text: n.textContent }));
	return out;
}

describe('paragraph-boundary whitespace (AST-level)', () => {
	it('drops the newline after a heading — no leading space before the next paragraph', () => {
		expect(blocks('\\section{text}\nhere is some other text')).toEqual([
			{ type: 'heading', text: 'text' },
			{ type: 'paragraph', text: 'here is some other text' }
		]);
	});

	it('keeps interior inter-word spaces', () => {
		expect(blocks('one two three')).toEqual([{ type: 'paragraph', text: 'one two three' }]);
	});

	it('drops trailing whitespace before a block', () => {
		expect(blocks('hello there \n\\section{x}')).toEqual([
			{ type: 'paragraph', text: 'hello there' },
			{ type: 'heading', text: 'x' }
		]);
	});

	it('trims leading/trailing whitespace of paragraphs split by a blank line', () => {
		expect(blocks('first para  \n\n  second para')).toEqual([
			{ type: 'paragraph', text: 'first para' },
			{ type: 'paragraph', text: 'second para' }
		]);
	});
});
