// hash router for the app's two views. a hash (not the History API) survives reloads and works
// identically under the packaged app:// origin and the http dev server, no server cooperation needed.
import { browser } from './runtime';

export const ROUTES = ['/', '/workspace', '/session'] as const;
export type RoutePath = (typeof ROUTES)[number];

/** '#/workspace/' -> '/workspace'; missing/empty hash -> '/'. */
function parseHash(): string {
	const raw = window.location.hash.replace(/^#/, '');
	if (!raw || raw === '/') return '/';
	return raw.replace(/\/+$/, '');
}

let current = $state<string>(browser ? parseHash() : '/');

if (browser) {
	window.addEventListener('hashchange', () => {
		current = parseHash();
	});
}

export const route = {
	get path(): string {
		return current;
	},
	/** false for a hash that matches no view. */
	get known(): boolean {
		return (ROUTES as readonly string[]).includes(current);
	}
};

export function navigate(path: string): void {
	if (browser) window.location.hash = path;
	// also set state directly, assigning an identical hash doesn't fire hashchange
	current = path === '' ? '/' : path.replace(/^#/, '');
}
