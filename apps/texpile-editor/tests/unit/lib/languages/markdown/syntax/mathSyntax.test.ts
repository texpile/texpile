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

describe('$ math', () => {
	it('reads $...$ and $$...$$ in a line and leaves what only looks like them as text', () => {
		expect(nodesOf('Euler $e^{i\\pi} = -1$ costs $5 and $ 10 and $a*b$ done.\n', 'InlineMath')).toEqual(['$e^{i\\pi} = -1$', '$a*b$']);
		expect(nodesOf('A \\$x$ and $$y$$\n', 'InlineMath')).toEqual(['$$y$$']);
	});

	it('reads $$ as a block over the lines that other blocks would start, up to the closing $$', () => {
		expect(nodesOf('$$\nE = mc^2\n- x\n$$\n\n$$ a $$\n', 'MathBlock')).toEqual(['$$\nE = mc^2\n- x\n$$', '$$ a $$']);
		expect(nodesOf('> $$\n> q\n> $$\n\n- item\n  $$\n  z\n  $$\n', 'MathBlock')).toHaveLength(2);
	});

	it('does not read a $$ that a blank line leaves unclosed', () => {
		expect(nodesOf('$$\nunclosed\n\ntext\n$$\n', 'MathBlock')).toEqual([]);
		expect(nodesOf('text\n$$5 and $$6 prices\nmore\n', 'MathBlock')).toEqual([]);
	});
});
