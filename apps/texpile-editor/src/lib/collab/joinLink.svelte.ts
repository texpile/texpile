// The web join link: https://join.texpile.com/#<code>. The code IS the session secret, so it
// rides the fragment - never sent to a server, never in a Referer - and is wiped at boot.

import { browser } from '$lib/runtime';
import { box } from '$lib/runes/box.svelte';
import { formatShareCode, isValidShareCode, normalizeShareCode } from './e2e/shareCode';

export const JOIN_APP_URL = 'https://join.texpile.com';

/** the link a host hands out for a share code. */
/** the desktop hand-off; carries the name so it is not typed twice. Never leaves the machine. */
export function appLinkFor(code: string, name: string): string {
	const trimmed = name.trim();
	const base = 'texpile://join/' + normalizeShareCode(code);
	return trimmed ? base + '?n=' + encodeURIComponent(trimmed) : base;
}

/** the name a hand-off carried, or '' when it had none. */
export function nameFromJoinLink(text: string): string {
	const m = /[?&]n=([^&\s]+)/.exec(text);
	if (!m) return '';
	try {
		return decodeURIComponent(m[1]).slice(0, 40);
	} catch {
		return '';
	}
}

export function joinLinkFor(code: string): string {
	return `${JOIN_APP_URL}/#${formatShareCode(code)}`;
}

/** the code in a join link. Fragment on the web (never hits a server), path for texpile://:
 *  some OS handoffs drop a fragment, and a bare paste would otherwise yield a wrong code. */
export function codeFromJoinLink(text: string): string {
	const m = /(?:#|\/join\/)([A-Za-z0-9-]+)\s*$/.exec(text.trim().split('?')[0]);
	return m && isValidShareCode(m[1]) ? normalizeShareCode(m[1]) : '';
}

/** seeded from this tab's URL at load, hence main.ts importing before the router reads the hash */
export const pendingJoinCode = box(takeFromHash());

/** paired with pendingJoinCode: a desktop hand-off can carry the name the web form took. */
export const pendingJoinName = box('');

if (browser) {
	// the address bar can hand over a code without a reload: pasting a join link while the page is
	// already open only changes the hash, and the read above ran once at module load. takeFromHash
	// rewrites the hash, which fires this again - harmless, the second pass finds no code.
	window.addEventListener('hashchange', () => {
		const next = takeFromHash();
		if (next) pendingJoinCode.current = next;
	});
}

function takeFromHash(): string {
	if (!browser) return '';
	const raw = window.location.hash.replace(/^#/, '');
	if (!raw || !isValidShareCode(raw)) return '';
	// leave the route behind, not the key: a bookmarked or shoulder-surfed URL would otherwise
	// carry it for as long as the tab lives
	window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/session`);
	return normalizeShareCode(raw);
}
