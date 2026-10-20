import { describe, expect, it } from 'vitest';
import { commonRegisterSize, commonSize, naturalSize, stretchesToFill } from '$lib/languages/latex/knowledge/commands/naturalSize';

describe('naturalSize', () => {
	it('reads the size a value states and leaves its glue', () => {
		expect(naturalSize('\\vskip 3.0pt plus 1.0pt minus 1.0pt')).toEqual({ amount: 3, unit: 'pt' });
		expect(naturalSize('\\hskip .5em')).toEqual({ amount: 0.5, unit: 'em' });
		expect(naturalSize('-1000.0pt plus 1.0fill')).toEqual({ amount: -1000, unit: 'pt' });
		expect(naturalSize('\\kern -.16667em')).toEqual({ amount: -0.16667, unit: 'em' });
		expect(naturalSize('\\mskip 4mu plus 2mu minus 4mu')).toEqual({ amount: 4 / 18, unit: 'em' });
		expect(naturalSize('Figure')).toBeNull();
	});

	it('reads a command through the data, a register only when it is one', () => {
		expect(commonSize('qquad', 'em')).toBe(2);
		expect(commonSize('qquad', 'pt')).toBeNull();
		expect(commonSize('thinspace', 'em')).toBe(0.16667);
		expect(commonSize(',', 'em')).toBe(3 / 18);
		expect(commonRegisterSize('parindent', 'pt')).toBe(15);
		expect(commonRegisterSize('quad', 'em')).toBeNull();
	});

	it('finds the commands that stretch to fill the line', () => {
		expect(['hfill', 'vfill', 'fill', 'hss', 'stretch'].map(stretchesToFill)).toEqual([true, true, true, true, true]);
		expect(['hskip', 'quad', 'linewidth', 'medskip'].map(stretchesToFill)).toEqual([false, false, false, false]);
	});
});
