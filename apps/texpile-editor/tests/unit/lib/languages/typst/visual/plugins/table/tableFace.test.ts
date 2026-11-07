// @vitest-environment jsdom
// a table the editor has no table node for (a vertical line, a grid with a body) drawn as the table Typst makes of it
import { describe, it, expect } from 'vitest';
import { typstFace } from '$lib/languages/typst/visual/core/walk/typstFace';
import { typstScopeNow } from '$lib/languages/typst/visual/core/scope/fileScopeNow.svelte';

typstScopeNow.current = null;

function cells(chip: string): HTMLElement[] {
	const face = typstFace(chip);
	if (!face) throw new Error(`not drawn: ${chip}`);
	return [...face.dom.querySelectorAll<HTMLElement>('.drawn-typst-cell')];
}

describe('a table with lines', () => {
	it('draws a vertical line as the left edge of the cells after it and a cell with a span across its columns', () => {
		const drawn = cells('#table(columns: 3, stroke: none, table.cell(colspan: 2)[wide], [c], [a], table.vline(), [b], [d])');
		expect(drawn.map((cell) => cell.textContent)).toEqual(['wide', 'c', 'a', 'b', 'd']);
		expect(drawn[0].style.gridColumn).toBe('1 / span 2');
		expect(drawn[3].style.borderLeft).toContain('solid');
		expect(drawn[2].style.borderLeft).toBe('');
	});

	it('draws the content blocks after a grid as its cells and a line across part of the table as code', () => {
		expect(cells('#grid(columns: 2)[a][b]')).toHaveLength(2);
		expect(typstFace('#table(columns: 2, [a], table.hline(start: 1), [b])')).toBeNull();
	});
});
