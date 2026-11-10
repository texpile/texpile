import type { ThemeSwatch } from './themeFiles';

export type ThemeTileInfo = { name: string; label: string; swatch: ThemeSwatch };

let presets: Promise<ThemeTileInfo[]> | null = null;

/** the built-in themes, from /themes/index.json (scripts/sync-themes.mjs); the default is the first */
export function loadPresetThemes(): Promise<ThemeTileInfo[]> {
	presets ??= fetch('/themes/index.json')
		.then((r) => (r.ok ? (r.json() as Promise<ThemeTileInfo[]>) : []))
		.catch(() => []);
	return presets;
}
