// The row, not the modal, decides where Cancel and the primary sit: macOS and Linux trail with the
// primary and keep Cancel beside it, Windows leads with the primary and ends with Cancel.
import { describe, expect, it } from 'vitest';
import { orderButtons } from '$lib/modals/dialogButtons';

const save = { label: 'Save', role: 'primary' as const };
const discard = { label: 'Discard' };
const cancel = { label: 'Cancel', role: 'cancel' as const };

describe('orderButtons', () => {
	it('macOS: the rest, Cancel, then the primary, whatever order the modal listed them in', () => {
		expect(orderButtons([save, cancel, discard], 'mac').map((b) => b.label)).toEqual(['Discard', 'Cancel', 'Save']);
	});

	it('Windows: the primary first, Cancel last', () => {
		expect(orderButtons([discard, cancel, save], 'windows').map((b) => b.label)).toEqual(['Save', 'Discard', 'Cancel']);
	});

	it('keeps the relative order of the plain buttons', () => {
		const a = { label: 'A' };
		const b = { label: 'B' };
		expect(orderButtons([a, b, save], 'windows').map((x) => x.label)).toEqual(['Save', 'A', 'B']);
		expect(orderButtons([a, b, save], 'mac').map((x) => x.label)).toEqual(['A', 'B', 'Save']);
	});
});
