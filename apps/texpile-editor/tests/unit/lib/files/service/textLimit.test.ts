import { describe, expect, it } from 'vitest';
import { MAX_TEXT_BYTES, exceedsTextLimit } from '$lib/files/service/textLimit';

describe('exceedsTextLimit', () => {
	it('counts bytes, so accented text under the limit in characters is still over it', () => {
		const accented = 'é'.repeat(MAX_TEXT_BYTES / 2 + 1);
		expect(accented.length).toBeLessThan(MAX_TEXT_BYTES);
		expect(exceedsTextLimit(accented)).toBe(true);
		expect(exceedsTextLimit('é'.repeat(MAX_TEXT_BYTES / 2))).toBe(false);
	});
});
