import { describe, expect, it } from 'vitest';
import { readComment, writeComment } from '$lib/editor/visual/extensions/drawnChips/comment/commentLines';

describe('commentLines', () => {
	it('edits the words and keeps every marker as written', () => {
		const source = '% a comment\n%%over three\n%   lines\n';
		const comment = readComment(source)!;
		expect(comment.text).toBe('a comment\nover three\n  lines');
		expect(writeComment(source, comment, comment.text)).toBe(source);
		expect(writeComment(source, comment, 'a comment\nover four\n  lines\nnow')).toBe('% a comment\n%%over four\n%   lines\n% now\n');
	});

	it('reads Typst line comments and refuses a chip that mixes in anything else', () => {
		expect(readComment('// one\n// two')?.marker).toBe('//');
		expect(readComment('% one\n\\vspace{1em}')).toBeNull();
		expect(readComment('% one\n// two')).toBeNull();
	});
});
