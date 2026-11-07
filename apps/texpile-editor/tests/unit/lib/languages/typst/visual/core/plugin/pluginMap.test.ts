import { describe, expect, it } from 'vitest';
import type { TypstFileScope } from '$lib/languages/typst/knowledge';
import { usePlugins } from '$lib/languages/typst/visual/core/plugin/pluginMap';
import { typstPlugins } from '$lib/languages/typst/visual/typstPlugins';
import { footnote } from '$lib/languages/typst/visual/plugins/footnote';
import { symbol } from '$lib/languages/typst/visual/plugins/symbol';

describe('usePlugins', () => {
	it('lists each function in one plugin only', () => {
		const names = typstPlugins.flatMap((plugin) => plugin.functions ?? []);
		expect(new Set(names).size).toBe(names.length);
	});

	it('takes a call of a name the paper defines past the plugin for Typst’s own', () => {
		expect(usePlugins({ form: 'call', name: 'footnote', origin: 'std', entry: null }, null)).toContain(footnote);
		const paper = {} as TypstFileScope;
		expect(usePlugins({ form: 'call', name: 'footnote', origin: null, entry: null }, paper)).not.toContain(footnote);
	});

	it('reaches a module’s plugin from its fields', () => {
		expect(usePlugins({ form: 'value', name: 'sym.arrow.r', origin: null, entry: null }, null)).toEqual([symbol]);
	});
});
