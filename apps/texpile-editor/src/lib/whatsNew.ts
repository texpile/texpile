import { box } from '$lib/runes/box.svelte';
import { settings } from '$lib/settings';

export type ChangelogEntry = {
	version: string;
	date?: string;
	notes: string[];
};

/** open signal for the panel; set from the Help menu and the start screen. */
export const whatsNewOpen = box(false);

/** drives the unread dot on the Help menu and the start screen row. */
export const hasUnseenWhatsNew = {
	get current(): boolean {
		return unseenEntries(__WHATS_NEW__, settings.current.whatsNewSeen).length > 0;
	}
};

// semver order: numeric core, then a final release outranks its own prereleases (1.0.0-rc.1 < 1.0.0)
function isNewer(a: string, b: string): boolean {
	const [ac, ap] = parts(a);
	const [bc, bp] = parts(b);
	for (let i = 0; i < 3; i++) if (ac[i] !== bc[i]) return ac[i] > bc[i];
	if (!ap.length || !bp.length) return !ap.length && bp.length > 0;
	for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
		const p = ap[i];
		const q = bp[i];
		if (p === undefined || q === undefined) return p !== undefined;
		if (p !== q) return typeof p === 'number' && typeof q === 'number' ? p > q : String(p) > String(q);
	}
	return false;
}

function parts(v: string): [number[], (number | string)[]] {
	const dash = v.indexOf('-');
	const core = (dash === -1 ? v : v.slice(0, dash)).split('.').map((n) => Number(n) || 0);
	while (core.length < 3) core.push(0);
	const pre =
		dash === -1
			? []
			: v
					.slice(dash + 1)
					.split('.')
					.map((x) => (/^\d+$/.test(x) ? Number(x) : x));
	return [core, pre];
}

// bounds an upgrade that skipped many releases; the newest sections win
const MAX_SHOWN = 8;

function sameMinor(a: string, b: string): boolean {
	const x = a.split('.');
	const y = b.split('.');
	return x[0] === y[0] && x[1] === y[1];
}

/** releases the user hasn't seen, oldest first (the modal renders them in order). `all` arrives
 *  newest-first from the changelog. An empty `seen` means a fresh install or an upgrade from
 *  before the marker existed (pre-0.13.0): both get the current minor series (0.13.x while 0.13
 *  is current), so each minor's showcase reaches everyone once and retires at the next minor. */
export function unseenEntries(all: ChangelogEntry[], seen: string): ChangelogEntry[] {
	if (!all.length) return [];
	const picked = seen
		? all.filter((e) => isNewer(e.version, seen)).slice(0, MAX_SHOWN)
		: all.filter((e) => sameMinor(e.version, all[0].version));
	return picked.reverse();
}

/** what to show when the panel is opened deliberately: the unseen releases if there are any,
 *  otherwise the current minor series, so it is never empty just because you're up to date. */
export function entriesToShow(all: ChangelogEntry[], seen: string): ChangelogEntry[] {
	if (!all.length) return [];
	const unseen = unseenEntries(all, seen);
	return unseen.length ? unseen : all.filter((e) => sameMinor(e.version, all[0].version)).reverse();
}
