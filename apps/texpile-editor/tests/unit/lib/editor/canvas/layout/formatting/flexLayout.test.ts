// flex rows and columns: grow and shrink, wrapping, order, reversed rows, auto margins and alignment
import { describe, expect, it } from 'vitest';
import { faceElement } from '$lib/editor/canvas';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import type { FixedStyleRule } from '../../testing/fixedStyles';
import { layoutTestBlock } from '../layoutFixture';

const BASE: FixedStyleRule[] = [
	{ selector: '.row', look: { display: 'flex' } },
	{ selector: '.item', look: { width: '60px', height: '20px' } }
];

function flexBox(container: Record<string, string>, items: Record<string, string>[], width = 300) {
	const rules: FixedStyleRule[] = [...BASE, { selector: '.row', look: { display: 'flex', ...container } }];
	items.forEach((look, i) => rules.push({ selector: `.i${i}`, look }));
	const root = faceElement('div', 'row');
	items.forEach((_, i) => root.appendChild(faceElement('div', `item i${i}`, '')));
	return layoutTestBlock(schema.nodes.paragraph.create(), { root, rules, width, justify: false }).box;
}

describe('a row', () => {
	it('shares the free space by grow weight', () => {
		const box = flexBox({}, [{ flexGrow: '1' }, { flexGrow: '3' }]);
		const [a, b] = box.children;
		expect([a.width, b.width, b.x]).toEqual([105, 195, 105]);
	});

	it('takes a percentage width of the row, held to its max-width', () => {
		const box = flexBox({ justifyContent: 'center' }, [{ width: '100%', maxWidth: '200px' }]);
		expect([box.children[0].width, box.children[0].x]).toEqual([200, 50]);
	});

	it('shrinks items past the row, by weight', () => {
		const box = flexBox({}, [{ width: '200px' }, { width: '200px' }]);
		expect(box.children.map((child) => child.width)).toEqual([150, 150]);
	});

	it('centers, or puts the last item at the end with an auto margin', () => {
		expect(flexBox({ justifyContent: 'center' }, [{}, {}]).children.map((child) => child.x)).toEqual([90, 150]);
		expect(flexBox({}, [{}, { marginLeft: 'auto' }]).children.map((child) => child.x)).toEqual([0, 240]);
	});

	it('wraps into lines under the row gap', () => {
		const box = flexBox(
			{ flexWrap: 'wrap', rowGap: '8px', columnGap: '10px' },
			Array.from({ length: 5 }, () => ({})),
			200
		);
		expect(box.children.map((child) => [child.x, child.y])).toEqual([
			[0, 0],
			[70, 0],
			[140, 0],
			[0, 28],
			[70, 28]
		]);
		expect(box.height).toBe(48);
	});

	it('orders by order, then source', () => {
		const box = flexBox({}, [{ order: '2' }, { order: '-1' }, {}]);
		expect(box.children.map((child) => child.x)).toEqual([120, 0, 60]);
	});

	it('lays a reversed row out from the right', () => {
		const box = flexBox({ flexDirection: 'row-reverse' }, [{}, {}]);
		expect(box.children.map((child) => child.x)).toEqual([240, 180]);
	});

	it('stretches an item without a height to the line, and centers on request', () => {
		const stretched = flexBox({}, [{ height: '40px' }, { height: 'auto' }]);
		expect(stretched.children[1].height).toBe(40);
		const centered = flexBox({ alignItems: 'center' }, [{ height: '40px' }, {}]);
		expect(centered.children[1].y).toBe(10);
	});

	it('centers an item in the height its aspect ratio gives', () => {
		const box = flexBox({ aspectRatio: '3 / 1', alignItems: 'center' }, [{}]);
		expect([box.height, box.children[0].y]).toEqual([100, 40]);
	});
});

describe('a column', () => {
	it('stacks items apart by the gap and stretches them across', () => {
		const box = flexBox({ flexDirection: 'column', rowGap: '4px' }, [{ width: 'auto' }, { width: 'auto' }]);
		expect(box.children.map((child) => [child.y, child.width])).toEqual([
			[0, 300],
			[24, 300]
		]);
	});

	it('centers its items in the height it is given', () => {
		const box = flexBox({ flexDirection: 'column', justifyContent: 'center', height: '100px' }, [{}, {}]);
		expect(box.children.map((child) => child.y)).toEqual([30, 50]);
	});
});
