// which Texpile versions can share a session

// raise to the release that changes what collaboration sends in a way older versions cannot handle;
// scripts/release.mjs warns when collaboration code changed and this did not
export const COLLAB_OLDEST = '1.4.0';

// what a peer from before this check counts as: 1.1.0 or older, and it takes anyone
const UNVERSIONED = { version: '1.1.0', oldest: '0.0.0' };

export type SessionVersion = { version: string; oldest: string };

export const THIS_VERSION: SessionVersion = { version: __APP_VERSION__, oldest: COLLAB_OLDEST };

function versionParts(version: string): number[] {
	const [major, minor, patch] = version.split('-')[0].split('.');
	return [major, minor, patch].map((n) => Number(n) || 0);
}

function isAtLeast(version: string, minimum: string): boolean {
	const a = versionParts(version);
	const b = versionParts(minimum);
	for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
	return true;
}

/** the range a newcomer must fit to share a session with every one of `peers` too: their oldest version, their newest floor */
export function commonVersion(mine: SessionVersion, peers: Iterable<Partial<SessionVersion>>): SessionVersion {
	let { version, oldest } = mine;
	for (const peer of peers) {
		const theirs = peer.version ?? UNVERSIONED.version;
		const floor = peer.oldest ?? UNVERSIONED.oldest;
		if (!isAtLeast(theirs, version)) version = theirs;
		if (!isAtLeast(oldest, floor)) oldest = floor;
	}
	return { version, oldest };
}

/** why two peers cannot share a session, or null when they can; a host's `hostVersion` tells it apart from its guests */
export function sessionMismatch(
	mine: SessionVersion,
	theirs: Partial<SessionVersion> & { hostVersion?: string }
): { outdated: 'them' | 'me' | 'guest'; version: string } | null {
	const version = theirs.version ?? UNVERSIONED.version;
	const oldest = theirs.oldest ?? UNVERSIONED.oldest;
	if (!isAtLeast(version, mine.oldest)) {
		const host = theirs.hostVersion;
		if (host === undefined) return { outdated: 'them', version };
		return isAtLeast(host, mine.oldest) ? { outdated: 'guest', version } : { outdated: 'them', version: host };
	}
	if (!isAtLeast(mine.version, oldest)) return { outdated: 'me', version: oldest };
	return null;
}
