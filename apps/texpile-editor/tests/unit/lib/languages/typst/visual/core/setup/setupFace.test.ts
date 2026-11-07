// @vitest-environment jsdom
// what sets a Typst document up drawn quiet, each statement a chip of its own, and a template given a title and
// authors drawn as the title block
import { describe, it, expect, vi } from 'vitest';
import { flushSync } from 'svelte';
import { parseTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { typstFace } from '$lib/languages/typst/visual/core/walk/typstFace';
import { followTypstImports, scopeOfFile, typstNamesNow, typstScopeNow } from '$lib/languages/typst/visual/core/scope/fileScopeNow.svelte';

function titleLines(face: ReturnType<typeof typstFace>): string[][] {
	return [...(face?.dom.querySelectorAll('.title-matter') ?? [])].map((line) => [line.className, line.textContent ?? '']);
}

describe('setup faces', () => {
	it('keeps an import and the rules after it apart, each drawn as a setting', () => {
		const file = '#import "@preview/fletcher:0.5.1": *\n#set align(left)\n#show heading: set align(center)\n\nText.\n';
		const chips: string[] = [];
		parseTypstFile(file).doc.forEach((node) => {
			if (node.type.name === 'raw_latex') chips.push(typstFace(node.textContent)?.dom.textContent ?? 'undrawn');
		});
		expect(chips).toEqual(['Package - fletcher 0.5.1', 'Align - left', 'Show heading - set align(center)']);
	});

	it('says when a rule is conditional, and leaves rules inside a block as code', () => {
		expect(typstFace('#set text(lang: "de") if german')?.dom.textContent).toBe('Text - lang: "de" - if german');
		expect(typstFace('#[#set text(red)]')).toBeNull();
		expect(typstFace('#[*#set text(red)\nhi*]')).toBeNull();
		expect(typstFace('#{\n  set text(red)\n  show heading: set align(center)\n}')).toBeNull();
	});

	it('draws a template of the project as its title block, its fields read from the file and its let', async () => {
		const modules = {
			'template.typ':
				'#let conf(title: none, who: none, abstract: none, doc) = {\n  set document(title: title, author: who, description: abstract)\n  doc\n}\n'
		};
		const file = '#import "template.typ": conf\n#let title = [A *Short* Paper]\n';
		typstScopeNow.current = await scopeOfFile(file, null, { path: 'main.typ', read: async (p) => modules[p as 'template.typ'] ?? null });
		const face = typstFace('#show: conf.with(title: title, who: (name: "Ada", affiliation: [Analytical Engine]), abstract: [Words.])');
		expect(titleLines(face)).toEqual([
			['title-matter title-matter-title', 'A Short Paper'],
			['title-matter title-matter-author', 'AdaAnalytical Engine'],
			['title-matter title-matter-abstract', 'AbstractWords.']
		]);
	});

	it('reads no part from a field name alone, and prints a date as Typst does', async () => {
		typstScopeNow.current = null;
		expect(typstFace('#show: whatever.with(title: [Big], date: [Today])')?.dom.textContent).toBe(
			'Show - whatever.with(title: [Big], date: [Today])'
		);
		const modules = { 'template.typ': '#let conf(date: none, doc) = {\n  set document(date: date)\n  doc\n}\n' };
		const file = '#import "template.typ": conf\n';
		typstScopeNow.current = await scopeOfFile(file, null, { path: 'main.typ', read: async (p) => modules[p as 'template.typ'] ?? null });
		expect(titleLines(typstFace('#show: conf.with(date: datetime(year: 2024, month: 3, day: 5))'))).toEqual([
			['title-matter title-matter-date', '2024-03-05']
		]);
		const shown = typstFace(
			'#show: conf.with(date: datetime(year: 2024, month: 3, day: 5).display("[month repr:long] [day padding:none], [year]"))'
		);
		expect(titleLines(shown)).toEqual([['title-matter title-matter-date', 'March 5, 2024']]);
	});

	it('draws the title block again in place when a let it reads changes on any of its lines', async () => {
		const modules = { 'template.typ': '#let conf(title: none, doc) = {\n  set document(title: title)\n  doc\n}\n' };
		const project = { path: 'main.typ', read: async (p: string) => modules[p as 'template.typ'] ?? null };
		const before = '#import "template.typ": conf\n#let title = [\n  Old Title\n]\n#show: conf.with(title: title)\n\nBody\n';
		typstScopeNow.current = null;
		followTypstImports(before, null, project);
		await vi.waitFor(() => expect(typstScopeNow.current).not.toBeNull());
		const face = typstFace('#show: conf.with(title: title)');
		expect(titleLines(face)).toEqual([['title-matter title-matter-title', 'Old Title']]);
		const names = typstNamesNow.current;
		followTypstImports(before.replace('Old Title', 'New Title'), null, project);
		flushSync();
		expect(titleLines(face)).toEqual([['title-matter title-matter-title', 'New Title']]);
		expect(typstNamesNow.current).toBe(names);
		face?.destroy?.();
	});
});
