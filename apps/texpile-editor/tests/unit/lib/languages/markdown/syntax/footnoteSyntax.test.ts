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

describe('footnotes', () => {
	it('reads [^label] as a reference, and [^label](url) as the link it is', () => {
		const src = 'Text[^1] and[^note] and [^x](https://x).\n';
		expect(nodesOf(src, 'FootnoteReference')).toEqual(['[^1]', '[^note]']);
		expect(nodesOf(src, 'Link')).toEqual(['[^x](https://x)']);
	});

	it('reads a definition over its indented lines, a blank line and a lazy line, and ends it at the next definition', () => {
		const src = '[^1]: first\n    second\n\n    para in note\n[^2]: two\nlazy\n\nafter\n';
		expect(nodesOf(src, 'FootnoteDefinition')).toEqual(['[^1]: first\n    second\n\n    para in note', '[^2]: two\nlazy']);
		expect(nodesOf(src, 'LinkReference')).toEqual([]);
	});
});
