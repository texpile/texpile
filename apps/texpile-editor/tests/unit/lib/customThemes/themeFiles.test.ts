import { describe, expect, it } from 'vitest';
import { customThemeFile, resolveThemeUrls, themeLabel, themeSwatch, type ThemeSwatch } from '$lib/customThemes/themeFiles';

const base: ThemeSwatch = { primary: 'blue', surfaceLight: 'white', surfaceDark: 'black', panelLight: 'silver', panelDark: 'gray' };

describe('a custom theme file', () => {
	it('is named from its file, as Typora names one', () => {
		expect(themeLabel('night-owl.css')).toBe('Night Owl');
		expect(themeLabel('my_first theme.CSS')).toBe('My First Theme');
	});

	it('shows the colors it sets on its tile and the default for the rest, never a var() of the page', () => {
		const css = ':root {\n\t--color-primary-500: #82aaff;\n\t--color-surface-50: var(--x);\n}';
		expect(themeSwatch(css, base)).toEqual({ ...base, primary: '#82aaff' });
	});

	it('is picked by a name that stays inside the themes folder', () => {
		expect(customThemeFile('custom:night-owl.css')).toBe('night-owl.css');
		expect(customThemeFile('custom:../settings.css')).toBeNull();
		expect(customThemeFile('custom:sub\\x.css')).toBeNull();
		expect(customThemeFile('dracula')).toBeNull();
	});

	it('loads its own fonts and images from the themes folder, and leaves data: and absolute urls alone', () => {
		const css = `@font-face { src: url("academic/stix.woff2"); }\nbody { background: url(owl.jpg), url(data:image/png;base64,AAA=), url('https://x.org/a.png'); }`;
		expect(resolveThemeUrls(css)).toBe(
			`@font-face { src: url("texpile-theme://themes/academic/stix.woff2"); }\nbody { background: url(texpile-theme://themes/owl.jpg), url(data:image/png;base64,AAA=), url('https://x.org/a.png'); }`
		);
	});
});
