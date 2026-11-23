// a list item's marker element hangs in the margin column: it ends at the item's left edge, on the first baseline
import { expect, it } from 'vitest';
import { faceElement } from '$lib/editor/canvas';
import { generatedPart } from '$lib/editor/canvas/nodes/generatedPart';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import type { FixedStyleRule } from '../testing/fixedStyles';
import { layoutTestBlock } from './layoutFixture';

it('places the marker text right of the margin column and level with the first line', () => {
	const root = faceElement('div', 'item');
	root.appendChild(faceElement('p', undefined, 'one two'));
	root.generatedMarker = generatedPart('• ', { position: 'absolute', right: '100%' });
	const rules: FixedStyleRule[] = [{ selector: '.item', look: { display: 'list-item', position: 'relative', margin: '0px 0px 0px 32px' } }];
	const layout = layoutTestBlock(schema.nodes.paragraph.create(), { root, rules, width: 300 });
	const marker = layout.box.children.find((child) => child.pseudo === 'marker')!;
	expect(marker.x + marker.width).toBe(0);
	expect(marker.y).toBe(0);
	expect(marker.lines).toHaveLength(1);
});
