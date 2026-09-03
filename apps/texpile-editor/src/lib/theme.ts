// light/dark/system appearance, and which theme's variables are on the page. the resolved mode
// lands as data-mode + a .dark class on <html>, the theme as data-theme plus its stylesheet;
// an inline script in app.html mirrors the resolve logic pre-paint to avoid a flash (reading the
// texpile:layout blob directly - keep its `theme` field in step with this module).
import { box } from '$lib/runes/box.svelte';
import { layout, updateLayout } from '$lib/storage/layout';

export type ThemeChoice = 'light' | 'dark' | 'system';

function stored(): ThemeChoice {
	return layout.current.theme;
}

function systemPrefersDark(): boolean {
	return (
		typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
	);
}

function resolve(choice: ThemeChoice): 'light' | 'dark' {
	return choice === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : choice;
}

/** the mode actually rendered (light/dark) after resolving "system". */
export const resolvedMode = box<'light' | 'dark'>('light');

function apply(resolved: 'light' | 'dark'): void {
	resolvedMode.current = resolved;
	if (typeof document === 'undefined') return;
	document.documentElement.setAttribute('data-mode', resolved);
	document.documentElement.classList.toggle('dark', resolved === 'dark');
}

/** the user's choice (light/dark/system), what the Preferences control binds to. */
export const themeChoice = box<ThemeChoice>(stored());

let mql: MediaQueryList | null = null;
function watchSystem(choice: ThemeChoice): void {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
	mql ??= window.matchMedia('(prefers-color-scheme: dark)');
	mql.onchange = choice === 'system' ? () => apply(resolve('system')) : null;
}

export function setTheme(choice: ThemeChoice): void {
	themeChoice.current = choice;
	updateLayout({ theme: choice });
	apply(resolve(choice));
	watchSystem(choice);
}

/** the theme on <html data-theme>: the bundled default or a Skeleton preset */
export const themeName = box<string>(layout.current.themeName);

const THEME_EL = 'texpile-theme';

function isPreset(name: string): boolean {
	return /^[a-z][a-z0-9-]*$/.test(name) && name !== 'theme';
}

/** put the theme's variables on the page: a <link> for a preset, nothing for the bundled default.
 *  theme-init.js does the same before first paint, and a match with what it left is kept rather
 *  than re-fetched, which would paint the default for a frame. */
function applyThemeName(wanted: string): void {
	const name = isPreset(wanted) ? wanted : 'theme';
	themeName.current = name;
	if (typeof document === 'undefined') return;
	const root = document.documentElement;
	if (root.getAttribute('data-theme') === name && (name === 'theme' || document.getElementById(THEME_EL))) return;
	document.getElementById(THEME_EL)?.remove();
	if (name !== 'theme') {
		const link = document.createElement('link');
		link.id = THEME_EL;
		link.rel = 'stylesheet';
		link.href = `/themes/${name}.css`;
		document.head.appendChild(link);
	}
	root.setAttribute('data-theme', name);
}

export function setThemeName(name: string): void {
	updateLayout({ themeName: name });
	applyThemeName(name);
}

// apply on module load; theme-init.js already handled the very first paint
if (typeof document !== 'undefined') {
	const choice = stored();
	apply(resolve(choice));
	watchSystem(choice);
	applyThemeName(layout.current.themeName);
}
