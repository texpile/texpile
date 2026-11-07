import { describe, expect, it } from 'vitest';
import { changedSpan } from '$lib/editor/changedSpan';

describe('changedSpan', () => {
	it('spans an insertion and an empty place for a deletion', () => {
		expect(changedSpan('ab cd', 'ab XY cd')).toEqual({ from: 3, to: 6 });
		expect(changedSpan('ab XY cd', 'ab cd')).toEqual({ from: 3, to: 3 });
		expect(changedSpan('same', 'same')).toBeNull();
	});
});
