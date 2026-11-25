import { describe, expect, it } from 'vitest';
import type { LayoutStyle } from '$lib/editor/canvas/contracts/styleTypes';
import { rootBoxOf, rootOuterHeight, rootSheetRect } from '$lib/editor/canvas/frame/rootBox';
import { defaultLayoutStyle } from '../testing/fixedStyles';

const px = (value: number) => ({ px: value, percent: 0 });
const percent = (value: number) => ({ px: 0, percent: value });

describe('the editor root box', () => {
	it('takes the editor margin out of the column', () => {
		const style: LayoutStyle = { ...defaultLayoutStyle(), margin: { top: px(4), right: px(4), bottom: px(4), left: px(4) } };
		const root = rootBoxOf(style, 768);
		expect([root.left, root.top, root.width]).toEqual([4, 4, 760]);
		expect(rootOuterHeight(root, 100)).toBe(108);
	});

	it('centers the page view sheet and puts its padding and min-height around the column', () => {
		const style: LayoutStyle = {
			...defaultLayoutStyle(),
			boxSizing: 'border-box',
			width: percent(85),
			maxWidth: px(1400),
			minHeight: px(630),
			margin: { top: px(32), right: 'auto', bottom: px(32), left: 'auto' },
			padding: { top: px(48), right: percent(8), bottom: px(48), left: percent(8) }
		};
		const root = rootBoxOf(style, 1000);
		expect([root.left, root.top, root.width]).toEqual([155, 80, 690]);
		expect(rootOuterHeight(root, 100)).toBe(80 + 534 + 48 + 32);
		expect(rootSheetRect(root, 100)).toEqual({ x: -80, y: -48, width: 850, height: 630 });
	});
});
