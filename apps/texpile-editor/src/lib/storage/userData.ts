// texpile:users - the user's own data, one versioned blob: identity (session name, comment
// author), personal word list, the recent-folders MRU, completion frecency, and the onboarding
// flags. Renderer-only and personal, which is what separates it from settings.json (machine/app
// configuration the MAIN process reads) and texpile:layout (how the window looks).
//
// Reactive via one svelte store; frecency is the hot writer here (a write per accepted
// completion), which localStorage absorbs without the IPC+disk cost settings.json would pay.

import { box } from '$lib/runes/box.svelte';

export type UserData = {
	v: 1;
	/** name shown to peers in shared sessions */
	collabName: string;
	collabColor: string;
	/** name put on review comments; blank falls back to the repo's git user.name */
	commentAuthor: string;
	/** spell-check ignore list */
	dictionary: string[];
	/** most-recent first */
	recentFolders: string[];
	/** completion frecency: label -> { s: decayed accept score, t: last accept ms epoch } */
	completionUsage: Record<string, { s: number; t: number }>;
	onboardingCompleted: boolean;
	tourCompleted: boolean;
	advancedWarningDismissed: boolean;
};

const KEY = 'texpile:users';
const MAX_RECENT = 10;

const DEFAULTS: UserData = {
	v: 1,
	collabName: '',
	collabColor: '',
	commentAuthor: '',
	dictionary: [],
	recentFolders: [],
	completionUsage: {},
	onboardingCompleted: false,
	tourCompleted: false,
	advancedWarningDismissed: false
};

function read(): UserData {
	if (typeof localStorage === 'undefined') return { ...DEFAULTS };
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<UserData> | null;
		if (raw && raw.v === 1) {
			const merged = { ...DEFAULTS, ...raw, v: 1 as const };
			// cap on read as well as write: a hand-edited entry must not render an unbounded list
			merged.recentFolders = merged.recentFolders.filter((p): p is string => typeof p === 'string').slice(0, MAX_RECENT);
			return merged;
		}
	} catch {
		/* corrupted: defaults */
	}
	return { ...DEFAULTS };
}

/** reactive user data, hydrated synchronously at module load. */
export const userData = box<UserData>(read());

/** merge a partial update and persist it. */
export function updateUserData(partial: Partial<Omit<UserData, 'v'>>): void {
	const next = { ...userData.current, ...partial, v: 1 as const };
	userData.current = next;
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(KEY, JSON.stringify(next));
	} catch {
		/* quota or storage disabled */
	}
}

/** move `path` to the front of the recents MRU. */
export function addRecentFolder(path: string): void {
	const list = userData.current.recentFolders;
	updateUserData({ recentFolders: [path, ...list.filter((p) => p !== path)].slice(0, MAX_RECENT) });
}
