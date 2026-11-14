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

// tablex names its lines, cells and spans with functions of its own, and the editor showed the call as code
describe('a tablex table', () => {
	it('draws the lines it draws by itself between its rows, and none between its columns when told so', () => {
		const drawn = cells('#tablex(columns: 2, auto-vlines: false, hlinex(y: 0), [*A*], [*B*], hlinex(y: 1), [a], [b], hlinex())');
		expect(drawn.map((cell) => cell.textContent)).toEqual(['A', 'B', 'a', 'b']);
		expect(drawn[0].style.borderTop).toContain('solid');
		expect(drawn[2].style.borderBottom).toContain('solid');
		expect(drawn[0].style.borderLeft).toBe('');
	});

	it('draws a span across its columns and takes the () after it as the place the span covers', () => {
		const drawn = cells('#tablex(columns: 2, colspanx(2)[wide], (), [a], [b])');
		expect(drawn.map((cell) => cell.textContent)).toEqual(['wide', 'a', 'b']);
		expect(drawn[0].style.gridColumn).toBe('1 / span 2');
		expect(drawn[1].style.borderLeft).toContain('solid');
	});
});
