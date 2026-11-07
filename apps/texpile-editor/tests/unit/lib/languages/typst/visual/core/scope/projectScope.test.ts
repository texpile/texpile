// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { typstFace } from '$lib/languages/typst/visual/core/walk/typstFace';
import { scopeOfFile, typstScopeNow } from '$lib/languages/typst/visual/core/scope/fileScopeNow.svelte';

describe('the project scope', () => {
	it('follows an import of a path a let holds', async () => {
		const modules: Record<string, string> = { 'libs/color.typ': '#let lemma(body) = [*Lemma.* #body]\n' };
		const file = '#let style = "./color.typ"\n#import style: *\n';
		typstScopeNow.current = await scopeOfFile(file, null, { path: 'libs/template.typ', read: async (p) => modules[p] ?? null });
		expect(typstFace('#lemma[It holds.]')?.dom.textContent).toBe('Lemma. It holds.');
	});

	it('leaves a std name to std in a chapter, and a name the file lets twice to code', async () => {
		const modules: Record<string, string> = { 'main.typ': '#let underline(body) = [WRONG #body]\n#include "ch.typ"\n' };
		typstScopeNow.current = await scopeOfFile('= x\n', null, { path: 'ch.typ', main: 'main.typ', read: async (p) => modules[p] ?? null });
		expect(typstFace('#underline[x]')?.dom.textContent ?? '').not.toContain('WRONG');
		typstScopeNow.current = await scopeOfFile('#let note = [A]\n#note\n#let note = [B]\n#note\n', null, {
			path: 'a.typ',
			read: async () => null
		});
		expect(typstFace('#note')).toBeNull();
	});
});
