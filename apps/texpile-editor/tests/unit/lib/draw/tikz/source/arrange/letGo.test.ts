import { describe, expect, it } from 'vitest';
import { letGoOf } from '$lib/draw/tikz/source/arrange/letGo';

describe('letting go of what is deleted', () => {
	it('writes the points taken from a node where they were, and frees what was placed beside it', () => {
		const src = String.raw`\begin{tikzpicture}
  \node[draw] (a) at (0,0) {A};
  \node[right=1cm of a] (b) {B};
  \draw (a.east) -- (b);
\end{tikzpicture}`;
		const anchors: (string | null)[] = [];
		const out = letGoOf(
			src,
			0,
			[1],
			(_, ref) => {
				anchors.push(ref.anchor);
				return [ref.anchor === 'east' ? 1 : 0, 0];
			},
			() => [2, 0]
		);
		expect(anchors).toEqual(['east']);
		expect(out).toContain('\\node (b) at (2,0) {B};');
		expect(out).toContain('\\draw (1,0) -- (b);');
	});
});
