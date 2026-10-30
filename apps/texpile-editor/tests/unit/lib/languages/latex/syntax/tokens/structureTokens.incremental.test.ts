import { describe, expect, it } from 'vitest';
import { latexParserFor } from '$lib/languages/latex/syntax/latexTrees';
import { firstDifference, reparse } from '../incrementalParse';

const LINE = 'some words here and {a group} more words\n';

// the parser reuses nodes in chunks counted back from the end, so the pad after the call moves one onto the token that read far back
function firstStaleAfter(call: string, edit: (at: number) => { from: number; to: number; insert: string }): string | null {
	const parser = latexParserFor(false);
	for (let pad = 0; pad < 600; pad += 3) {
		const text = `${LINE.repeat(30)}${call}\n${LINE.repeat(120)}${'y'.repeat(pad)}`;
		const { tree, fresh } = reparse(parser, text, edit(text.indexOf(call)));
		const difference = firstDifference(tree, fresh);
		if (difference) return `pad ${pad}: ${difference}`;
	}
	return null;
}

describe('structureTokens', () => {
	it('rereads a url argument after an edit to its command far before it', () => {
		const call = `\\href[${'o'.repeat(180)}]{a%b}`;
		expect(firstStaleAfter(call, (at) => ({ from: at + 1, to: at + 2, insert: 'x' }))).toBeNull();
	});

	it('rereads an iffalse after an edit to the let that names it far before it', () => {
		const call = `\\let\\a${' '.repeat(120)}\\iffalse a b \\fi`;
		expect(firstStaleAfter(call, (at) => ({ from: at + 1, to: at + 2, insert: 'x' }))).toBeNull();
	});
});
