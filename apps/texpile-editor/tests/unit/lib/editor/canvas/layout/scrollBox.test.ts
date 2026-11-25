import { expect, it } from 'vitest';
import { faceElement } from '$lib/editor/canvas';
import { maxScrollLeft } from '$lib/editor/canvas/layout/scrollBox';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import type { FixedStyleRule } from '../testing/fixedStyles';
import { layoutTestBlock } from './layoutFixture';

// a wide table overflows the wrapper the scroll box stretches to its own width: the box still scrolls to the table's end
it('scrolls as far as a grandchild overflows its parent', () => {
	const rules: FixedStyleRule[] = [
		{ selector: '.scroller', look: { display: 'flex', flexDirection: 'column', overflowX: 'auto' } },
		{ selector: '.wide', look: { width: '900px', height: '10px' } }
	];
	const root = faceElement('div', 'scroller');
	const wrapper = faceElement('div');
	wrapper.appendChild(faceElement('div', 'wide'));
	root.appendChild(wrapper);
	const layout = layoutTestBlock(schema.nodes.paragraph.create(), { root, rules, width: 300 });
	expect(layout.box.children[0].width).toBeCloseTo(300);
	expect(maxScrollLeft(layout.box)).toBe(600);
});
