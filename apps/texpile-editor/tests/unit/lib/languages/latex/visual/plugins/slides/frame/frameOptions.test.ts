import { describe, expect, it } from 'vitest';
import { frameOptionParts, frameOptionsText } from '$lib/languages/latex/visual/plugins/slides/frame/frameOptions';

describe('a frame', () => {
	it('takes its options apart as written and puts them back the same', () => {
		for (const options of ['', '[fragile]', '<2->[t,shrink=10]', '<1-2>[<+->][plain]']) {
			expect(frameOptionsText(frameOptionParts(options)!)).toBe(options);
		}
		expect(frameOptionParts('<2->[t,fragile]')).toEqual({ overlay: '<2->', defaultOverlay: '', keys: ['t', 'fragile'] });
		expect(frameOptionParts('[fragile] % why')).toBeNull();
	});
});
