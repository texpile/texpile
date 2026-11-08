// the user's own themes and the one on the page. The page gets it as a constructed stylesheet, which the cascade puts
// after every <link> and <style>: it wins ties against Texpile's own styles however late those load
import { fileService } from '$lib/files/service/fileService';
import { joinPath } from '$lib/workspace/fileSystem';
import { customThemeName, resolveThemeUrls, themeLabel, themeSwatch, type ThemeSwatch } from './themeFiles';
import { filledShadesCss } from './shadeFill';

type ThemesBridge = {
	list(): Promise<{ dir: string; files: string[] }>;
	open(): Promise<string>;
	onChanged(cb: () => void): () => void;
};

function bridge(): ThemesBridge | undefined {
	return (globalThis.window as unknown as { texpileThemes?: ThemesBridge } | undefined)?.texpileThemes;
}

/** false in the browser build, which has no themes folder */
export function customThemesAvailable(): boolean {
	return !!bridge();
}

export type CustomThemeTile = { name: string; label: string; swatch: ThemeSwatch };

export const customThemes = $state<{ tiles: CustomThemeTile[] }>({ tiles: [] });

// theme-init.js puts the last one on the page before first paint, from here
const CACHE_KEY = 'texpile:custom-theme';

let folder: string | null = null;
let pageCss: string | null = null;

async function readTheme(file: string): Promise<string | null> {
	const b = bridge();
	if (!b) return null;
	folder ??= (await b.list()).dir;
	const path = joinPath(folder, file);
	return (await fileService.exists(path)) ? fileService.readText(path) : null;
}

export async function loadCustomThemes(base: ThemeSwatch): Promise<void> {
	const b = bridge();
	if (!b) return;
	const list = await b.list();
	folder = list.dir;
	customThemes.tiles = await Promise.all(
		list.files.map(async (file) => ({
			name: customThemeName(file),
			label: themeLabel(file),
			swatch: themeSwatch((await readTheme(file).catch(() => null)) ?? '', base)
		}))
	);
}

function cache(entry: { name: string; css: string } | null): void {
	try {
		if (entry) localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
		else localStorage.removeItem(CACHE_KEY);
	} catch {
		// over the quota (a theme with big images inlined): that theme starts a frame late
		try {
			localStorage.removeItem(CACHE_KEY);
		} catch {
			/* no storage */
		}
	}
}

function sheetOf(css: string, win: Window & typeof globalThis = window): CSSStyleSheet {
	const sheet = new win.CSSStyleSheet();
	sheet.replaceSync(css);
	return sheet;
}

/** false when the file is gone */
export async function applyCustomTheme(file: string): Promise<boolean> {
	const text = await readTheme(file).catch(() => null);
	if (text === null) {
		clearCustomTheme();
		return false;
	}
	const css = resolveThemeUrls(text) + filledShadesCss(text);
	pageCss = css;
	// the document's constructed sheets are the custom theme's alone
	document.adoptedStyleSheets = [sheetOf(css)];
	cache({ name: customThemeName(file), css });
	return true;
}

export function clearCustomTheme(): void {
	pageCss = null;
	if (typeof document !== 'undefined' && document.adoptedStyleSheets?.length) document.adoptedStyleSheets = [];
	cache(null);
}

/** the theme on this page, made again in another window's document */
export function customThemeSheetsFor(win: Window & typeof globalThis): CSSStyleSheet[] {
	return pageCss === null ? [] : [sheetOf(pageCss, win)];
}

export function openThemesFolder(): void {
	void bridge()?.open();
}

export function onCustomThemesChanged(cb: () => void): () => void {
	return bridge()?.onChanged(cb) ?? (() => {});
}
