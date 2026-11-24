// absolute boxes out of flow: an equation's number at the right of its display and an ordered item's label before it
import { expect, it } from 'vitest';
import { faceElement, setLook, type LayoutBox, type StyleLook } from '$lib/editor/canvas';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import type { FixedStyleRule } from '../testing/fixedStyles';
import { layoutTestBlock } from './layoutFixture';

function hostWith(
	className: string,
	part: 'generatedBefore' | 'generatedAfter',
	text: string,
	look: StyleLook
): ReturnType<typeof faceElement> {
	const root = faceElement('div', className);
	const generated = faceElement('span', undefined, text);
	generated.generated = true;
	setLook(generated, look);
	root[part] = generated;
	root.appendChild(faceElement('p', undefined, 'one two three'));
	return root;
}

const pseudoBox = (box: LayoutBox, pseudo: LayoutBox['pseudo']) => box.children.find((child) => child.pseudo === pseudo)!;

it("places a display's number at its right inset, centered by its translate", () => {
	const rules: FixedStyleRule[] = [{ selector: '.display', look: { position: 'relative', padding: '20px 0px' } }];
	const numberLook = { display: 'block', position: 'absolute', top: '50%', right: '16px', translate: '0px -50%' } as const;
	const layout = layoutTestBlock(schema.nodes.paragraph.create(), {
		root: hostWith('display', 'generatedAfter', '(3)', numberLook),
		rules,
		width: 300
	});
	const number = pseudoBox(layout.box, 'after');
	expect(number.lines![0].fragments.map((fragment) => (fragment.kind === 'generated' ? fragment.text : ''))).toEqual(['(3)']);
	expect(number.x + number.width).toBeCloseTo(300 - 16);
	expect(number.y + number.height / 2).toBeCloseTo(layout.box.height / 2);
	expect(layout.box.children.indexOf(number), 'painted after the content in flow').toBe(layout.box.children.length - 1);
});

it("ends an ordered item's label at its padding box's start, on its first line", () => {
	const rules: FixedStyleRule[] = [{ selector: '.item', look: { position: 'relative', marginLeft: '32px' } }];
	const marker = { display: 'block', position: 'absolute', right: '100%' } as const;
	const layout = layoutTestBlock(schema.nodes.paragraph.create(), {
		root: hostWith('item', 'generatedBefore', '12. ', marker),
		rules,
		width: 300
	});
	const label = pseudoBox(layout.box, 'before');
	expect(label.x + label.width).toBeCloseTo(0);
	expect(label.y + label.baselines!.first).toBeCloseTo(layout.box.baselines!.first);
	const paragraph = layout.box.children[0];
	expect(paragraph.pseudo, 'the paragraph stays first in flow').toBeNull();
});

// a selected table cell's wash: an empty span on all four insets drew nothing, then only one line tall
it('gives an empty part on all four insets the whole padding box', () => {
	const rules: FixedStyleRule[] = [{ selector: '.cell', look: { position: 'relative', padding: '20px 0px' } }];
	const wash = { display: 'block', position: 'absolute', top: '0px', right: '0px', bottom: '0px', left: '0px' } as const;
	const layout = layoutTestBlock(schema.nodes.paragraph.create(), {
		root: hostWith('cell', 'generatedAfter', '', wash),
		rules,
		width: 300
	});
	const part = pseudoBox(layout.box, 'after');
	expect(part).toBeDefined();
	expect(part.width).toBeCloseTo(300);
	expect(part.height).toBeCloseTo(layout.box.height);
});
