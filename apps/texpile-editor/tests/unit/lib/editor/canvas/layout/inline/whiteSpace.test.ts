import { it, expect } from 'vitest';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { layoutTestBlock, lineTexts } from '../layoutFixture';

// monoMeasure: every character 9.6 px wide at 16 px, so a stop of eight spaces every 76.8 px
it('advances a tab to the next stop of eight spaces and breaks a line by its width there', () => {
	const [line] = layoutTestBlock(schema.nodes.paragraph.create(null, schema.text('a\tbb'))).box.lines!;
	expect(line.fragments.find((fragment) => fragment.kind === 'text' && fragment.text === 'bb')!.x).toBeCloseTo(76.8);
	// measured as one space, 'aa\tbbbb' would fit 100 px
	const layout = layoutTestBlock(schema.nodes.paragraph.create(null, schema.text('aa\tbbbb')), { width: 100 });
	expect(lineTexts(layout)).toEqual(['aa\t', 'bbbb']);
});
