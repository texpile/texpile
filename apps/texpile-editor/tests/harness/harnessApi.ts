import { settings, type AppSettings } from '$lib/settings';
import { setTheme } from '$lib/theme';
import { preferences } from '$lib/stores/preferencesStore.svelte';
import type { HarnessLoad, HarnessSession } from './harnessSession.svelte';

/** what a test calls on the page: window.__harness */
export type HarnessApi = {
	ready: true;
	load(options: HarnessLoad): void;
	open(rel: string): Promise<void>;
	text(rel: string): string | undefined;
	setTheme(mode: 'light' | 'dark'): void;
	setZoom(zoom: number): void;
	setSettings(partial: Partial<AppSettings>): void;
};

export function harnessApi(session: HarnessSession): HarnessApi {
	return {
		ready: true,
		load: (options) => session.load(options),
		open: (rel) => session.open(rel),
		text: (rel) => session.folder.text(rel),
		setTheme: (mode) => setTheme(mode),
		setZoom: (zoom) => void (preferences.zoom = zoom),
		setSettings: (partial) => void (settings.current = { ...settings.current, ...partial })
	};
}
