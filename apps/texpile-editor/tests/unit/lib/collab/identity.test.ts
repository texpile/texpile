// a chosen name or color has to win over both roles' defaults
import { describe, it, expect, beforeEach } from 'vitest';
import { presenceIdentity, HOST_COLOR } from '$lib/collab/identity';
import { GUEST_COLORS } from '$lib/collab/guestColors';
import { updateUserData } from '$lib/storage/userData';

describe('presence identity', () => {
	beforeEach(() => updateUserData({ collabName: '', collabColor: '' }));

	it('falls back to the role', () => {
		expect(presenceIdentity('host')).toEqual({ name: 'Host', color: HOST_COLOR });
		expect(presenceIdentity('guest', 1)).toEqual({ name: 'Guest', color: GUEST_COLORS[1] });
	});

	it('uses the profile for both roles', () => {
		updateUserData({ collabName: '  Mei  ', collabColor: '#059669' });
		expect(presenceIdentity('host')).toEqual({ name: 'Mei', color: '#059669' });
		expect(presenceIdentity('guest', 1)).toEqual({ name: 'Mei', color: '#059669' });
	});

	it('takes the name handed to it over the stored one', () => {
		updateUserData({ collabName: 'Mei' });
		expect(presenceIdentity('guest', 0, 'Louis').name).toBe('Louis');
	});
});
