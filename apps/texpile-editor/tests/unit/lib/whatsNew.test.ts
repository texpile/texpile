import { describe, it, expect } from 'vitest';
import { unseenEntries } from '$lib/whatsNew';

// changelog order: newest first
const ALL = [
	{ version: '0.13.1', notes: ['fix a'] },
	{ version: '0.13.0', notes: ['live mode'] },
	{ version: '0.12.0', notes: ['older'] }
];

describe('what’s new selection', () => {
	it('shows every release skipped, oldest first', () => {
		expect(unseenEntries(ALL, '0.12.0').map((e) => e.version)).toEqual(['0.13.0', '0.13.1']);
	});

	it('shows only the new one when the previous release was seen', () => {
		expect(unseenEntries(ALL, '0.13.0').map((e) => e.version)).toEqual(['0.13.1']);
	});

	it('shows nothing when the newest was already seen', () => {
		expect(unseenEntries(ALL, '0.13.1')).toEqual([]);
	});

	it('orders prereleases below their final release', () => {
		const rc = [
			{ version: '1.0.0', notes: ['final'] },
			{ version: '1.0.0-rc.2', notes: ['rc2'] },
			{ version: '1.0.0-rc.1', notes: ['rc1'] },
			...ALL
		];
		expect(unseenEntries(rc, '1.0.0-rc.1').map((e) => e.version)).toEqual(['1.0.0-rc.2', '1.0.0']);
		expect(unseenEntries(rc, '0.13.1').map((e) => e.version)).toEqual(['1.0.0-rc.1', '1.0.0-rc.2', '1.0.0']);
		expect(unseenEntries(rc, '1.0.0')).toEqual([]);
	});

	it('empty marker (fresh install or pre-marker upgrade) shows the current minor series only', () => {
		expect(unseenEntries(ALL, '').map((e) => e.version)).toEqual(['0.13.0', '0.13.1']);
	});

	it('empty marker at a later minor shows that whole line and nothing older', () => {
		const later = [{ version: '0.14.2', notes: ['c'] }, { version: '0.14.1', notes: ['b'] }, { version: '0.14.0', notes: ['a'] }, ...ALL];
		expect(unseenEntries(later, '').map((e) => e.version)).toEqual(['0.14.0', '0.14.1', '0.14.2']);
	});

	it('caps an upgrade that skipped many releases at the newest entries', () => {
		const many = Array.from({ length: 12 }, (_, i) => ({ version: `0.${20 - i}.0`, notes: ['x'] }));
		const shown = unseenEntries(many, '0.8.0').map((e) => e.version);
		expect(shown).toHaveLength(8);
		expect(shown[shown.length - 1]).toBe('0.20.0');
		expect(shown[0]).toBe('0.13.0');
	});

	it('handles an empty changelog', () => {
		expect(unseenEntries([], '')).toEqual([]);
	});
});
