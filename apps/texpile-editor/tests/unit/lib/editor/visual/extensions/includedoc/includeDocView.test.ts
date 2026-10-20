import { describe, expect, it } from 'vitest';
import { resolveIncludePaths } from '$lib/editor/visual/extensions/includedoc/includeDocView.svelte';

describe('resolveIncludePaths', () => {
	it('offers the names TeX tries for the command, under the open file folder', () => {
		expect(resolveIncludePaths('C:/p/sec', 'chap', 'input')).toEqual(['C:/p/sec/chap.tex', 'C:/p/sec/chap']);
		expect(resolveIncludePaths('C:/p/sec', '../a.b', 'include')).toEqual(['C:/p/a.b.tex']);
		expect(resolveIncludePaths('C:/p', 'x', 'typst')).toEqual(['C:/p/x.typ']);
	});
});
