import { expect, it, vi } from 'vitest';

const read = vi.hoisted(() => {
	let finish = (_text: string) => {};
	const text = new Promise<string>((resolve) => (finish = resolve));
	return { text, finish: (css: string) => finish(css) };
});
vi.mock('$lib/files/service/fileService', () => ({
	fileService: { exists: async () => true, readText: () => read.text }
}));

class FakeSheet {
	replaceSync(): void {}
}
vi.stubGlobal('window', {
	CSSStyleSheet: FakeSheet,
	texpileThemes: { list: async () => ({ dir: '/themes', files: [] }) }
});
vi.stubGlobal('document', { adoptedStyleSheets: [] as unknown[] });

const { applyCustomTheme, clearCustomTheme } = await import('$lib/customThemes/customThemes.svelte');

it('leaves a theme read that finishes after another pick off the page', async () => {
	const applying = applyCustomTheme('night-owl.css');
	clearCustomTheme();
	read.finish(':root { --color-primary-500: red; }');
	expect(await applying).toBe('superseded');
	expect(document.adoptedStyleSheets).toEqual([]);
});
