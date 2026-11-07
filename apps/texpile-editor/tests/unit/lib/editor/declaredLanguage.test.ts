import { describe, expect, it, vi } from 'vitest';

const reads = vi.hoisted(() => ({ count: 0 }));
vi.mock('$lib/languages/latex/syntax/documentWrapper', async (orig) => {
	const real = await orig<typeof import('$lib/languages/latex/syntax/documentWrapper')>();
	return {
		...real,
		documentWrapperOf: (source: string) => {
			reads.count++;
			return real.documentWrapperOf(source);
		}
	};
});

const { declaredLanguage } = await import('$lib/editor/declaredLanguage');

const file = (preamble: string, body: string) => `\\documentclass{article}\n${preamble}\n\\begin{document}\n${body}\n\\end{document}\n`;

describe('declared language while typing', () => {
	it('reads the preamble again only when it changes', () => {
		expect(declaredLanguage(file('\\usepackage[ngerman]{babel}', 'Hallo'))?.name).toBe('ngerman');
		const before = reads.count;
		expect(declaredLanguage(file('\\usepackage[ngerman]{babel}', 'Hallo Welt'))?.name).toBe('ngerman');
		expect(declaredLanguage(file('\\usepackage[ngerman]{babel}', 'Hallo Welt, wie'))?.name).toBe('ngerman');
		expect(reads.count).toBe(before);
		expect(declaredLanguage(file('\\usepackage[french]{babel}', 'Hallo Welt, wie'))?.name).toBe('french');
		expect(reads.count).toBe(before + 1);
	});
});
