import { describe, expect, it } from 'vitest';
import { faceElement, type BlockLayout, type ComputedStyle } from '$lib/editor/canvas';
import { BlockEstimates } from '$lib/editor/canvas/document/estimates';
import { fixedStyles } from '../testing/fixedStyles';
import { testSchema } from '../testing/testCanvasView';

const style = fixedStyles([{ selector: 'p', look: { margin: '12px 0px 6px' } }]);
function paragraphStyle(): ComputedStyle | null {
	return style.styleOf(faceElement('p'));
}

function paragraph(chars: number) {
	return testSchema.node('paragraph', null, [testSchema.text('x'.repeat(chars))]);
}

function laidOut(height: number): BlockLayout {
	return {
		box: { style: paragraphStyle() } as never,
		height,
		outerMargin: { top: 12, bottom: 6 },
		positions: null as never,
		keys: [],
		error: null
	};
}

describe('block estimates', () => {
	it('take a face estimate first, else the text at the width in the type line, with its margins', () => {
		const estimates = new BlockEstimates((node) => (node.type.name === 'image' ? 180 : null));
		expect(estimates.estimate(testSchema.node('image'), 600, paragraphStyle).height).toBe(180);
		// 200 chars of 8 px on a 600 px line: three 24 px lines
		expect(estimates.estimate(paragraph(200), 600, paragraphStyle)).toEqual({
			height: 72,
			marginTop: 12,
			marginBottom: 6,
			estimated: true
		});
	});

	it('correct a type by how far its measured blocks were off', () => {
		const estimates = new BlockEstimates(() => null);
		estimates.learn(paragraph(200), 600, laidOut(96));
		estimates.learn(paragraph(100), 600, laidOut(64));
		// ratios 96/72 and 64/48 average to 4/3
		expect(estimates.estimate(paragraph(300), 600, paragraphStyle).height).toBeCloseTo(96 * (4 / 3));
	});
});
