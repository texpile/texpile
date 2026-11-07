import { describe, expect, it } from 'vitest';
import { readSpacing, writeSpacing } from '$lib/languages/typst/visual/plugins/spacing/spacingCall';

describe('spaces', () => {
	it('reads Typst lengths, sums included', () => {
		expect(readSpacing('#v(1em)')).toMatchObject({ vertical: true, amount: '1em', length: { em: 1 }, weak: false });
		expect(readSpacing('#h(1fr)')?.length).toEqual({ fill: true });
		expect(readSpacing('#h(50%)')?.length).toEqual({ share: 0.5 });
		expect(readSpacing('#v(1em + 11pt, weak: true)')).toMatchObject({ length: { em: 2 }, weak: true });
		expect(readSpacing('#v(-2.2pt)')?.length).toEqual({ em: -0.2 });
		// drawn, though no setting can show the amount
		expect(readSpacing('#v(gap)')).toMatchObject({ amount: 'gap', length: null });
		expect(readSpacing('#v(1em, 2em)')).toBeNull();
	});

	it('writes the amount and weakness in place', () => {
		expect(writeSpacing('#v(1em)', { amount: '1em + 2pt', weak: false })).toBe('#v(1em + 2pt)');
		expect(writeSpacing('#h(1em)', { amount: '1em', weak: true })).toBe('#h(1em, weak: true)');
		expect(writeSpacing('#v(1em, weak: true)', { amount: '1em', weak: false })).toBe('#v(1em)');
		expect(writeSpacing('#v(1em)', { amount: '1em +', weak: false })).toBeNull();
	});
});
