import { describe, expect, it } from 'vitest';
import { moveStatements, groupStatements } from '$lib/draw/tikz/source/arrange/arrange';
import { removeStatement } from '$lib/draw/tikz/source/arrange/blocks';
import { brokenNeed } from '$lib/draw/tikz/source/arrange/statementNeeds';
import { readPicture } from '$lib/draw/tikz/source/picture';

const SRC = String.raw`\begin{tikzpicture}
  \tikzset{box/.style={draw}}
  \pgfmathsetmacro{\h}{1.5}
  \node[box] (a) at (0,0) {A};
  \draw[->] (a) -- (\h,\h);
\end{tikzpicture}`;

const picture = (s: string) => readPicture(s)!;
const why = (after: string) => {
	const b = brokenNeed(SRC, after, 0);
	return b && [b.need.kind, b.need.name, b.why];
};

describe('what statements need from each other', () => {
	it('finds an arrow moved before the node it starts at, and a macro grouped away from its use', () => {
		expect(why(moveStatements(SRC, picture(SRC), [4], { before: 3 })!.source)).toEqual(['node', 'a', 'first']);
		expect(why(groupStatements(SRC, picture(SRC), [2])!.source)).toEqual(['macro', '\\h', 'group']);
		expect(why(moveStatements(SRC, picture(SRC), [3], { after: 4 })!.source)).toEqual(['node', 'a', 'first']);
	});

	it('finds a style deleted while a node still uses it, and lets an unused one go', () => {
		const style = picture(SRC).statements[0];
		expect(why(removeStatement(SRC, style))).toEqual(['style', 'box', 'gone']);
		const unused = SRC.replace('\\node[box]', '\\node[draw]');
		expect(brokenNeed(unused, removeStatement(unused, picture(unused).statements[0]), 0)).toBeNull();
	});
});
