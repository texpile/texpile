import { describe, expect, it } from 'vitest';
import { latexCodeRanges, markdownCodeRanges, type CodeRange } from '$lib/editor/snippets/expand/codeRanges';

function codeIn(text: string, ranges: CodeRange[]): string[] {
	return ranges.map((r) => text.slice(r.from, r.to));
}

describe('code ranges', () => {
	it('\\mintinline takes its language, then braces or any delimiter', () => {
		const text = 'a \\mintinline{py}{x = $1} b \\mintinline[style=x]{sh}!echo $a! c $d$';
		expect(codeIn(text, latexCodeRanges(text))).toEqual(['\\mintinline{py}{x = $1}', '\\mintinline[style=x]{sh}!echo $a!']);
	});

	it('Markdown indented code starts only where a paragraph or list item cannot continue', () => {
		const text = 'para\n    still para\n\n    code $a\n\n    more\nnext\n\n- item\n\n    item text $b$';
		expect(codeIn(text, markdownCodeRanges(text))).toEqual(['    code $a\n\n    more\n']);
	});

	it('Markdown link destinations and autolinks are code, the link text is not', () => {
		const text = 'See [the $x$ page](https://a.org/$y "t") and ![img](<p q.png>), or <https://b.org/$z>. Not [this] (one).';
		expect(codeIn(text, markdownCodeRanges(text))).toEqual(['(https://a.org/$y "t")', '(<p q.png>)', '<https://b.org/$z>']);
	});
});

describe('code ranges: verbatim commands from the package data', () => {
	it('\\Verb and a braced \\lstinline with a nested brace are code', () => {
		const text = 'a \\Verb|$1| b \\lstinline{f{$2}} c $d$';
		expect(codeIn(text, latexCodeRanges(text))).toEqual(['\\Verb|$1|', '\\lstinline{f{$2}}']);
	});
});
