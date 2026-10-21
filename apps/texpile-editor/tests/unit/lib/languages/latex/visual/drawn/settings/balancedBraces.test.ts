import { describe, expect, it } from 'vitest';
import { balancedBraces } from '$lib/languages/latex/visual/extensions/drawn/settings/balancedBraces';

describe('text a chip panel writes into an argument', () => {
	it('is refused when it would close the command early or leave it open', () => {
		expect(balancedBraces('a}b{')).toBe(false);
		expect(balancedBraces('a {b} \\{')).toBe(true);
		// typing \alpha passes through a\, which would escape the closing brace
		expect(balancedBraces('a\\')).toBe(false);
		// a percent sign would comment out the closing brace
		expect(balancedBraces('50%')).toBe(false);
		expect(balancedBraces('50\\%')).toBe(true);
	});
});
