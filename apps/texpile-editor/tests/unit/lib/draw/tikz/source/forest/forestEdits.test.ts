import { describe, expect, it } from 'vitest';
import { instrumentPicture } from '$lib/draw/tikz/source/instrument';
import { readPicture } from '$lib/draw/tikz/source/picture';
import { addBranch, moveBranch, removeBranch, shiftBranch } from '$lib/draw/tikz/source/forest/forestEdits';

const SRC = String.raw`\begin{document}
\begin{forest}
  for tree={draw}
  [S
    [NP [D, red] [N]]
    [VP]
  ]
\end{forest}
\end{document}`;

const pic = (s: string) => readPicture(s)!;
const branch = (s: string, head: string) => pic(s).statements.find((x) => s.slice(x.from, x.to).startsWith(`[${head}`))!;

describe('reading a tree', () => {
	it('reads each branch as a statement, the root first and each before its children', () => {
		expect(pic(SRC).layout).toBe('tree');
		expect(pic(SRC).statements.map((s) => SRC.slice(s.from, s.to).split(/\s/)[0])).toEqual(['[S', '[NP', '[D,', '[N]', '[VP]']);
	});

	it('marks each node by an option of its own, and the end as forest closes the picture', () => {
		const sent = instrumentPicture(SRC, pic(SRC));
		expect(sent).toContain('end draw/.prefix code={\\tikzcapmark{0}}');
		expect(sent).toContain('[NP, tikzcap=2 [D, tikzcap=3, red] [N, tikzcap=4]]');
		expect(sent).toContain('draw tree node/.code={\\tikzcapmark{\\forestove{tikzcap}}');
	});
});

describe('editing a tree', () => {
	it('adds a child on its line and a sibling on a line of its own', () => {
		const child = addBranch(SRC, branch(SRC, 'VP').from, 'child', 'V')!;
		expect(child.source).toContain('[VP [V]]');
		expect(child.source.slice(child.at, child.at + 3)).toBe('[V]');
		expect(addBranch(SRC, branch(SRC, 'NP').from, 'sibling', 'PP')!.source).toContain('[NP [D, red] [N]]\n    [PP]\n    [VP]');
		expect(addBranch(SRC, branch(SRC, 'S').from, 'sibling', 'X')).toBeNull();
	});

	it('moves a branch under another with everything in it, never into itself', () => {
		const moved = moveBranch(SRC, branch(SRC, 'D').from, branch(SRC, 'VP').from)!;
		expect(moved.source).toContain('[NP [N]]\n    [VP [D, red]]');
		expect(moveBranch(SRC, branch(SRC, 'NP').from, branch(SRC, 'N').from)).toBeNull();
	});

	it('swaps a branch with its sibling, and takes one out with its line', () => {
		expect(shiftBranch(SRC, branch(SRC, 'VP').from, -1)!.source).toContain('[S\n    [VP]\n    [NP [D, red] [N]]\n  ]');
		expect(removeBranch(SRC, branch(SRC, 'VP').from)).toContain('[NP [D, red] [N]]\n  ]');
	});
});
