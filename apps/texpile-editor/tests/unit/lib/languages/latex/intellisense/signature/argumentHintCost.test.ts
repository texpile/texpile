// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';

const h = vi.hoisted(() => ({ resolved: 0 }));
vi.mock('$lib/languages/latex/intellisense/packages/loadedPackages', async (original) => {
	const real = await original<typeof import('$lib/languages/latex/intellisense/packages/loadedPackages')>();
	return {
		...real,
		preamblePackagesNow: (text: string) => {
			h.resolved++;
			return real.preamblePackagesNow(text);
		}
	};
});

const { argumentHintAt } = await import('$lib/languages/latex/intellisense/signature/argumentHints');

function hintAt(marked: string) {
	const doc = marked.replaceAll('|', '');
	return argumentHintAt(EditorState.create({ doc, selection: { anchor: marked.indexOf('|') } }));
}

describe('the cost of an argument hint', () => {
	it('resolves the loaded packages only where a call may be open', () => {
		h.resolved = 0;
		hintAt('\\usepackage{graphicx}\n\\begin{document}\nSome plain text and more|');
		hintAt('\\begin{document}\n\\item a list entry with text|');
		expect(h.resolved).toBe(0);
		hintAt('\\begin{document}\n\\textbf{bold|');
		expect(h.resolved).toBe(1);
		hintAt('\\begin{document}\n\\input |');
		expect(h.resolved).toBe(2);
	});
});
