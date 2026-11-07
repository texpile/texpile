import { describe, expect, it } from 'vitest';
import { typSchema as schema } from '$lib/languages/typst/visual/schema';
import { typstInsertItems } from '$lib/languages/typst/visual/core/plugin/typstInsertList';

const parts = (items: Awaited<ReturnType<typeof typstInsertItems>>) => [...new Set(items.map((i) => i.part ?? i.category))];

describe("a Typst file's insert list", () => {
	it("offers Typst's text, then the file's own functions with what they are made with, then Typst's layout calls", async () => {
		const items = await typstInsertItems(
			'#import "@preview/ctheorems:1.1.3": *\n#let theorem = thmbox("theorem", "Theorem")\n#let note(body) = block(body)\n#let card = rect.with(inset: 4pt)\n'
		);
		const of = (category: string) => items.filter((i) => i.category === category);
		expect(of('text').map((i) => i.id)).toEqual([
			'standard',
			'heading:1',
			'heading:2',
			'heading:3',
			'heading:4',
			'heading:5',
			'bullet',
			'ordered',
			'terms',
			'quote'
		]);
		expect(of('thisFile').map((i) => [i.id, i.hint])).toEqual([
			['env:theorem', 'thmbox - ctheorems'],
			['env:note', undefined],
			['env:card', 'rect']
		]);
		expect(of('layout').map((i) => i.id)).toEqual(expect.arrayContaining(['env:block', 'env:align', 'env:columns']));
		expect(of('layout').map((i) => i.id)).not.toContain('env:page');
		expect(parts(items)).toEqual(['common', 'text', 'thisFile', 'layout']);
	});

	it('gives each imported package a part of its own with the functions that take a body and no internals', async () => {
		const items = await typstInsertItems('#import "@preview/gentle-clues:1.3.1": *\n#import "@preview/touying:0.6.1": alert, appendix\n');
		const clues = items.filter((i) => i.part === 'gentle-clues');
		expect(clues.map((i) => i.id)).toEqual(expect.arrayContaining(['env:clue', 'env:info', 'env:warning', 'env:task']));
		expect(clues.map((i) => i.id)).not.toContain('env:_predefined-clue');
		expect(clues.every((i) => i.hint === undefined)).toBe(true);
		const touying = items.filter((i) => i.part === 'touying');
		expect(touying.map((i) => [i.id, i.shape])).toEqual([['text:alert', 'inline']]);
		expect(parts(items)).toEqual(['common', 'text', 'gentle-clues', 'touying', 'layout']);
	});

	it('starts the layout calls that need a first argument with one', async () => {
		const items = await typstInsertItems('');
		const args = (id: string) => {
			const item = items.find((i) => i.id === id);
			return item?.shape === 'block' ? item.make(schema)?.attrs.args : undefined;
		};
		expect(['align', 'columns', 'rotate', 'scale', 'block'].map((n) => args(`env:${n}`))).toEqual(['center', '2', '90deg', '100%', null]);
	});
});
