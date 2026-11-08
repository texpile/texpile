// a custom theme as the themes folder holds it: a .css file, picked by name as `custom:<file>`
import { declaredShades, fillFamily, type ColorFamily } from './shadeFill';

export const CUSTOM_THEME_PREFIX = 'custom:';
/** where a theme's relative url() resolves: its own files, served by texpile-theme:// */
export const THEME_BASE_URL = 'texpile-theme://themes/';

const URL_REF = /url\(\s*(['"]?)(.*?)\1\s*\)/g;

/** relative url()s made absolute in the themes folder. Chromium ignores a constructed sheet's baseURL, so a
 *  relative one would load from the page */
export function resolveThemeUrls(css: string): string {
	return css.replace(URL_REF, (whole, quote: string, ref: string) =>
		!ref || /^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(ref) ? whole : `url(${quote}${new URL(ref, THEME_BASE_URL).href}${quote})`
	);
}

export type ThemeSwatch = {
	primary: string;
	surfaceLight: string;
	surfaceDark: string;
	panelLight: string;
	panelDark: string;
};

export function customThemeName(file: string): string {
	return CUSTOM_THEME_PREFIX + file;
}

/** the file a stored theme name picks, or null for a preset */
export function customThemeFile(name: string): string | null {
	const file = name.startsWith(CUSTOM_THEME_PREFIX) ? name.slice(CUSTOM_THEME_PREFIX.length) : '';
	return /^[^/\\]+\.css$/i.test(file) ? file : null;
}

/** Typora's rule: night-owl.css shows as Night Owl */
export function themeLabel(file: string): string {
	return file
		.replace(/\.css$/i, '')
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((w) => w[0].toUpperCase() + w.slice(1))
		.join(' ');
}

function tileShades(css: string, family: ColorFamily): Map<number, string> {
	const set = declaredShades(css, family);
	return new Map([...set, ...fillFamily(set, (_shade, value) => value)]);
}

function pick(value: string | undefined, fallback: string): string {
	// a var() would resolve against the page the tile sits in, not the theme
	return value && !value.includes('var(') ? value : fallback;
}

/** the tile's colors from what the theme sets and blends, the rest from the theme it builds on */
export function themeSwatch(css: string, base: ThemeSwatch): ThemeSwatch {
	const primary = tileShades(css, 'primary');
	const surface = tileShades(css, 'surface');
	return {
		primary: pick(primary.get(500), base.primary),
		surfaceLight: pick(surface.get(50), base.surfaceLight),
		surfaceDark: pick(surface.get(950), base.surfaceDark),
		panelLight: pick(surface.get(200), base.panelLight),
		panelDark: pick(surface.get(800), base.panelDark)
	};
}
