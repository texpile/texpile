import { describe, expect, it } from 'vitest';
import { texLength } from '$lib/languages/latex/visual/extensions/drawn/texLength';

describe('texLength', () => {
	it('draws a register the data holds at its article value', () => {
		expect(texLength('\\baselineskip')).toEqual({ em: 1.2 });
		expect(texLength('2\\headsep')).toEqual({ em: 5 });
		expect(texLength('\\linewidth')).toEqual({ share: 1 });
		expect(texLength('\\figurename')).toBeNull();
		expect(texLength('\\hfill')).toEqual({ fill: true });
		expect(texLength('\\stretch{2}')).toEqual({ fill: true });
	});
});
