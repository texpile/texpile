// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';

describe('a caption in a chip', () => {
	it('draws a caption left in the text with its label, dropping the skip LyX ends it with', () => {
		const face = latexFace('\\caption{\\label{tab3} Energy per site $E$.\\smallskip{}\n}', false);
		expect(face?.dom.className).toBe('drawn-caption');
		expect(face?.dom.querySelector('.drawn-label')?.textContent).toBe('tab3');
		expect(face?.dom.textContent).toContain('Energy per site');
		expect(face?.dom.querySelector('.drawn-vspace')).toBeNull();
		expect(latexFace('\\captionof{table}{Expressions of $x$.}', false)?.dom.textContent).toBe('Table: Expressions of .');
	});
});
