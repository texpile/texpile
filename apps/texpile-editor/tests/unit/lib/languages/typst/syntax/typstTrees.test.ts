import { expect, it, vi } from 'vitest';

let builds = 0;
vi.mock('texpile-typst-syntax-wasm', () => ({
	TypstParser: class {
		constructor() {
			if (builds++ === 0) throw new Error('wasm did not load');
		}
		parse() {
			return { length: 0 };
		}
	}
}));

it('loads the parser again after a load that failed', async () => {
	const { loadTypstParser } = await import('$lib/languages/typst/syntax/typstTrees');
	await expect(loadTypstParser()).rejects.toThrow('wasm did not load');
	await expect(loadTypstParser()).resolves.toBeTruthy();
});
