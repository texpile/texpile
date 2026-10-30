import { describe, expect, it } from 'vitest';
import { latexParserFor } from '$lib/languages/latex/syntax/latexTrees';
import { firstDifference, reparse } from '../incrementalParse';

const LINE = 'text \\ar@{-->} and \\tl_set:Nn more {a \\b_c} words\n';
const LINES = LINE.repeat(300);

describe('openConstructs', () => {
	for (const word of ['\\makeatletter', '\\ExplSyntaxOn']) {
		it(`rereads the nodes after ${word} typed above them`, () => {
			const { tree, fresh } = reparse(latexParserFor(false), LINES, { from: 0, to: 0, insert: `${word}\n` });
			expect(firstDifference(tree, fresh)).toBeNull();
		});
	}

	it('rereads the nodes after the \\makeatletter that was above them is deleted', () => {
		const text = `\\makeatletter\n${LINES}`;
		const { tree, fresh } = reparse(latexParserFor(false), text, { from: 0, to: 14, insert: '' });
		expect(firstDifference(tree, fresh)).toBeNull();
	});

	it('reads environments nested past the depth Lezer cuts its stack at', () => {
		const tree = latexParserFor(false).parse('\\begin{itemize}\\item a '.repeat(2500));
		let nodes = 0;
		tree.iterate({ enter: () => void nodes++ });
		expect(nodes).toBeGreaterThan(2500);
	});
});
