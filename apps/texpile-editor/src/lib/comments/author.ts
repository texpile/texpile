// Who a comment is from.
//
// The name from Preferences first, then the repo's git user.name. The order matters: the
// Preferences name is the one the user typed to be seen by other people, so it has to win, but
// leaving it blank must not stop anyone commenting - the whole point of the log is that it gets
// committed and read by another person.
//
// There is no OS-account tier. The renderer cannot see the OS username without another IPC round
// trip, and a browser deliberately exposes nothing of the sort; anyone with neither a Preferences
// name nor a git identity is a person git could not attribute a commit to either.
//
// Resolved once per workspace and cached. It cannot change under us without a Preferences edit or
// a folder change, both of which call this again.
import { nativeBridge } from '$lib/workspace/fileSystem';

/** shown when there is no configured name anywhere */
const UNKNOWN = 'Unknown';

let cache: { root: string | null; name: string } | null = null;

export async function resolveAuthor(root: string | null, preferred: string): Promise<string> {
	const set = preferred.trim();
	if (set) return set;
	if (cache && cache.root === root) return cache.name;
	const name = (await gitName(root)) ?? UNKNOWN;
	cache = { root, name };
	return name;
}

/** drop the cache so the next resolve re-reads git; call when the workspace changes */
export function forgetAuthor(): void {
	cache = null;
}

async function gitName(root: string | null): Promise<string | null> {
	if (!root) return null;
	try {
		return (await nativeBridge()?.gitIdentity?.(root))?.name ?? null;
	} catch {
		// no bridge, no git, not a repo - all the same answer here, and none of them is an error
		return null;
	}
}
