// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { StyleEpoch, type StyleSettings } from '$lib/editor/canvas/style/theme/styleEpoch';
import { assertTokenName, isTokenName } from '$lib/editor/canvas/style/theme/tokenList';
import type { ThemeTokens } from '$lib/editor/canvas/style/theme/themeTokens';

function epochOf(layout: boolean, paint = true): StyleEpoch {
	const view = document.defaultView!;
	view.matchMedia = ((query: string) => ({ media: query, matches: false, addEventListener() {}, removeEventListener() {} })) as never;
	return new StyleEpoch(document, { read: vi.fn(() => ({ paint, layout })) } as unknown as ThemeTokens);
}

const SETTINGS: StyleSettings = { justify: false, hyphenate: false, pageView: false, readOnly: false, viewportWidth: 1200 };

describe('the style epoch', () => {
	it('bumps paint alone for a theme switch and both when a layout token differs', () => {
		const calm = epochOf(false);
		calm.bump('attributes');
		expect([calm.paint, calm.layout]).toEqual([1, 0]);
		const moved = epochOf(true);
		moved.bump('attributes');
		expect([moved.paint, moved.layout]).toEqual([1, 1]);
	});

	// the app toggles classes on html while the writer types (a drag, a refused drop): the canvas reads only tokens
	it('bumps nothing for a class change that moves no token', () => {
		const still = epochOf(false, false);
		still.bump('attributes');
		still.bump('sheets');
		expect([still.paint, still.layout, still.styles]).toEqual([0, 0, 0]);
	});

	it('reads the tokens again when a theme stylesheet finishes loading', () => {
		const epoch = epochOf(true);
		const link = document.createElement('link');
		document.head.appendChild(link);
		const before = epoch.layout;
		link.dispatchEvent(new Event('load'));
		expect(epoch.layout).toBe(before + 1);
		epoch.destroy();
		link.remove();
	});

	it('bumps layout for a setting, and for the window width only across 768', () => {
		const epoch = epochOf(false);
		epoch.setSettings(SETTINGS);
		epoch.setSettings({ ...SETTINGS, viewportWidth: 1000 });
		expect(epoch.layout).toBe(0);
		epoch.setSettings({ ...SETTINGS, viewportWidth: 700 });
		expect(epoch.layout).toBe(1);
		epoch.setSettings({ ...SETTINGS, viewportWidth: 700, justify: true });
		expect(epoch.layout).toBe(2);
	});
});

describe('the token list', () => {
	it('holds the tokens of the theme rules and throws in dev for a name off the list', () => {
		for (const name of ['--glass-line', '--glass-sheet-blur', '--solid-surface-50', '--editor-selection'])
			expect(isTokenName(name)).toBe(true);
		expect(() => assertTokenName('--not-a-token', true)).toThrow();
		expect(() => assertTokenName('--not-a-token', false)).not.toThrow();
	});
});
