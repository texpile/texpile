import { describe, expect, it } from 'vitest';
import { lineHeightPx, parseLength, transformStyle, whiteSpace } from '$lib/editor/canvas/style/resolve/cssValues';

describe('computed values', () => {
	it('reduces a calc() of px and % to one length and leaves anything else out', () => {
		expect(parseLength('calc(50% + 4px)')).toEqual({ px: 4, percent: 50 });
		expect(parseLength('calc(-50% - 0.5px)')).toEqual({ px: -0.5, percent: -50 });
		expect(parseLength('calc(0.5 * (100% - 8px))')).toEqual({ px: -4, percent: 50 });
		expect(parseLength('auto')).toBeNull();
		expect(parseLength('min(100%, 768px)')).toBeNull();
	});

	it('takes a line height Gecko leaves as a number as a multiple of the font size', () => {
		expect(lineHeightPx('26px', 16)).toBe(26);
		expect(lineHeightPx('1.625', 16)).toBe(26);
		expect(lineHeightPx('normal', 16)).toBe('normal');
	});

	it('reads white-space from its longhands where the engine splits it', () => {
		expect(whiteSpace('', 'break-spaces', 'wrap')).toBe('break-spaces');
		expect(whiteSpace('', 'preserve', 'nowrap')).toBe('pre');
		expect(whiteSpace('pre-wrap', '', '')).toBe('pre-wrap');
	});

	it('keeps a percentage translate for layout to resolve against the box', () => {
		const style = transformStyle('translateY(-50%)', 'none', 'none', 'none', '50% 50%');
		expect(style?.translate).toEqual({ x: { px: 0, percent: 0 }, y: { px: 0, percent: -50 } });
		expect(transformStyle('none', 'none', 'none', 'none', '0px 0px')).toBeNull();
	});
});
