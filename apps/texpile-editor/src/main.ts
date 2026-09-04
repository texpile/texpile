// FIRST import, load-bearing: migrates pre-restructure storage keys before any module below
// reads one at module scope (the theme, the layout store, the recents list)
import '$lib/migration/local';
// before anything reads location.hash: lifts the share code out of a join link and rewrites the
// URL to the plain /session route
import '$lib/collab/joinLink.svelte';
import { mount } from 'svelte';
import './app.css';
import '$lib/theme'; // side-effect: applies the saved appearance and watches OS changes
import { loadSettings } from '$lib/settings';
import { adoptBootOpen, bootOpen } from '$lib/workspace/openWorkspace';
import { focusDoctor } from '$lib/debug/focusDoctor';
import { mark, startupDoctor } from '$lib/debug/startupDoctor';
import { warmEditor } from '$lib/warmup';
import App from './App.svelte';

// Silence console.log is from legacy webapp, not nesscarily needed for desktop app
window.texpile = window.texpile || { debug: { log: import.meta.env.DEV } };
window.texpileFocusDoctor = focusDoctor;
window.texpileStartupDoctor = startupDoctor;
mark('boot');
const originalLog = console.log;
console.log = (...args: unknown[]) => {
	if (window.texpile?.debug?.log) {
		originalLog.apply(console, args);
	}
};

// some pre-bundler libraries probe a Node-style `global`
(window as unknown as { global: Window }).global = window;

window.addEventListener('error', (e) => console.error('[client error]', (e.error && e.error.stack) || e.error || e.message));
window.addEventListener('unhandledrejection', (e) => console.error('[client error]', e.reason));

// adopt before mount, or the start screen renders first and is thrown away
const boot = bootOpen();
if (boot) {
	// head start only; App's own loader owns the retry and the error path
	void import('./views/workspace/WorkspaceView.svelte').catch(() => {});
	adoptBootOpen(boot);
}

// wait for the persisted uiLocale before the first render, so a non-English user never sees a
// flash of English UI (settings.ts applies the locale as soon as this resolves). top-level await
// isn't available at this app's build target, hence the .then() instead of an await here.
loadSettings().then(() => {
	mark('settings');
	mount(App, { target: document.getElementById('app')! });
	if (!bootOpen()) warmEditor(); // a restored folder opens a file at once; EditorPane warms after it
});
