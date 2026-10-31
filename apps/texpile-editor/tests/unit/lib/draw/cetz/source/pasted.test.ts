import { describe, expect, it } from 'vitest';
import { cetzLanguage as lang } from '$lib/draw/cetz/cetzLanguage';

const SRC = `#import "@preview/cetz:0.4.2": canvas, draw

#canvas({
  import draw: *
  rect((0, 0), (2, 1), name: "n1"); content("n1", [A])
})
`;

describe('pasted CeTZ', () => {
	it('names what it pastes apart from what the picture holds, and what points at it with it', () => {
		const pasted = 'rect((3, 0), (5, 1), name: "n1"); content("n1", [B])\nline("n1.east", (7, 0))';
		const next = lang.appendStatements(SRC, 0, pasted)!;
		expect(next).toContain('rect((3, 0), (5, 1), name: "n2"); content("n2", [B])\n  line("n2.east", (7, 0))');
		expect(next).toContain('rect((0, 0), (2, 1), name: "n1"); content("n1", [A])');
	});

	it('imports the draw functions bare for a canvas that calls them through draw', () => {
		const prefixed = SRC.replace('  import draw: *\n', '').replace('rect(', 'draw.rect(').replace('content(', 'draw.content(');
		expect(lang.appendStatements(prefixed, 0, 'circle((1, 1))')).toMatch(/#canvas\(\{\n {2}import draw: \*\n[\s\S]*circle\(\(1, 1\)\)/);
	});
});
