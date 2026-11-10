// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';

const saved = vi.hoisted(() => ({ current: { theme: 'light', themeName: 'theme' } as Record<string, unknown> }));
vi.mock('$lib/storage/layout', () => ({
	layout: {
		get current() {
			return saved.current;
		}
	},
	updateLayout: (patch: Record<string, unknown>) => Object.assign(saved.current, patch)
}));
vi.mock('$lib/workspace/fileSystem', () => ({ nativeBridge: () => undefined }));
vi.mock('$lib/customThemes/customThemes.svelte', () => ({
	applyCustomTheme: async () => 'applied',
	clearCustomTheme: () => true,
	onCustomThemesChanged: () => () => {}
}));

const { setThemeName, themeEpoch } = await import('$lib/theme');

it('tells the title bar, terminal and child windows when a custom theme goes back to the default', async () => {
	setThemeName('custom:night-owl.css');
	await vi.waitFor(() => expect(themeEpoch.current).toBeGreaterThan(1));
	const epoch = themeEpoch.current;
	setThemeName('theme');
	expect(themeEpoch.current).toBe(epoch + 1);
});
