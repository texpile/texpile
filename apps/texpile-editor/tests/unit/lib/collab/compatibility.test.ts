import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COLLAB_OLDEST, sessionMismatch } from '$lib/collab/compatibility';

it('names the outdated side, and treats a peer without a version as 1.1.0', () => {
	const mine = { version: '1.4.0', oldest: '1.3.0' };
	expect(sessionMismatch(mine, { version: '1.3.2', oldest: '1.2.0' })).toBeNull();
	expect(sessionMismatch(mine, { version: '1.2.9', oldest: '1.0.0' })).toEqual({ outdated: 'them', version: '1.2.9' });
	expect(sessionMismatch(mine, { version: '1.6.0', oldest: '1.5.0' })).toEqual({ outdated: 'me', version: '1.5.0' });
	expect(sessionMismatch(mine, {})).toEqual({ outdated: 'them', version: '1.1.0' });
	expect(sessionMismatch({ version: '1.1.0', oldest: '1.1.0' }, {})).toBeNull();
	expect(sessionMismatch(mine, { version: '1.3.0-rc.2', oldest: '1.3.0' })).toBeNull();
});

it('names a guest in the session as the outdated one when the host itself is new enough', () => {
	const mine = { version: '1.4.0', oldest: '1.3.0' };
	// a session the host speaks for: its own version beside the oldest in the session
	expect(sessionMismatch(mine, { version: '1.2.0', oldest: '1.2.0', hostVersion: '1.3.0' })).toEqual({
		outdated: 'guest',
		version: '1.2.0'
	});
	expect(sessionMismatch(mine, { version: '1.2.0', oldest: '1.2.0', hostVersion: '1.2.5' })).toEqual({
		outdated: 'them',
		version: '1.2.5'
	});
	expect(sessionMismatch(mine, { version: '1.3.0', oldest: '1.2.0', hostVersion: '1.3.0' })).toBeNull();
	expect(sessionMismatch({ version: '1.2.0', oldest: '1.2.0' }, { version: '1.3.0', oldest: '1.3.0', hostVersion: '1.4.0' })).toEqual({
		outdated: 'me',
		version: '1.3.0'
	});
	// a host from before it said so is the one named, as before
	expect(sessionMismatch(mine, { version: '1.2.0', oldest: '1.2.0' })).toEqual({ outdated: 'them', version: '1.2.0' });
});

it('keeps COLLAB_OLDEST at or below the app version, or the app could not share a session with itself', () => {
	const version: string = JSON.parse(readFileSync(join(__dirname, '../../../../../../package.json'), 'utf8')).version;
	expect(sessionMismatch({ version, oldest: COLLAB_OLDEST }, { version, oldest: COLLAB_OLDEST })).toBeNull();
});
