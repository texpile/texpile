import { describe, it, expect } from 'vitest';
import { markdownParser } from '$lib/languages/markdown/syntax/markdownSyntax';

/** the text of the nodes of `src` called `name` */
function nodesOf(src: string, name: string): string[] {
	const out: string[] = [];
	markdownParser.parse(src).iterate({
		enter(node) {
			if (node.name === name) out.push(src.slice(node.from, node.to));
		}
	});
	return out;
}

// what @lezer/markdown reads differently from CommonMark and GitHub, which the parser here corrects
describe('the Markdown parser', () => {
	it('keeps the link around a bare pair of brackets in its text', () => {
		expect(nodesOf('[parse(source[, options])](docs/parsing.md#parse)\n', 'Link')).toEqual([
			'[parse(source[, options])](docs/parsing.md#parse)'
		]);
	});

	it('reads a table whose rows end in spaces', () => {
		expect(nodesOf('| a | b |  \n| --- | --- |  \n| 1 | 2 |  \n', 'Table')).toHaveLength(1);
	});

	it('reads a tag that closes itself alone on a line as an HTML block', () => {
		expect(nodesOf('before\n\n<br/>\n\nafter\n', 'HTMLBlock')).toEqual(['<br/>']);
	});

	it('opens a code span right after an escaped backtick', () => {
		expect(nodesOf('x \\`` y` z\n', 'InlineCode')).toEqual(['` y`']);
	});
});
