// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { typstFace } from '$lib/languages/typst/visual/core/walk/typstFace';
import { scopeOfFile, typstScopeNow } from '$lib/languages/typst/visual/core/scope/fileScopeNow.svelte';

async function faceIn(file: string, chip: string) {
	typstScopeNow.current = await scopeOfFile(file, null, { path: 'main.typ', main: null, read: async () => null });
	return typstFace(chip);
}

const FILE = [
	'#import "@preview/ctheorems:1.1.3": *',
	'#let lemma = thmplain("lemma", "Lemma")',
	'#let thm = thmbox("theorem", "Theorem")',
	'#let rule = thmplain("rule", "Rule", separator: [ --- ])'
].join('\n');

it("draws a package's theorem with the head its maker prints, its count left out", async () => {
	const lemma = await faceIn(FILE, '#lemma("Snake Lemma")[It holds.]');
	const head = lemma?.dom.querySelector('.env-head[data-look="theorem"]');
	expect(head?.textContent).toBe('Lemma (Snake Lemma):');
	expect([...(head?.querySelectorAll('em') ?? [])].map((e) => e.textContent)).toEqual(['Lemma', '(Snake Lemma)']);
	expect(lemma?.dom.querySelector('.typ-environment-body')?.textContent).toBe('It holds.');
	const thm = (await faceIn(FILE, '#thm("Named")[Plain.]'))?.dom.querySelector('.env-head');
	expect(thm?.querySelector('strong')?.textContent).toBe('Theorem');
	expect(thm?.textContent).toBe('Theorem (Named):');
});

it('names a theorem as written when its call or its maker is given what the data did not run', async () => {
	const chips = [
		['#lemma(title: "Foo")[It holds.]', 'lemma'],
		['#lemma("Snake Lemma", number: "5")[It holds.]', 'lemma'],
		['#rule[It holds.]', 'rule']
	];
	for (const [chip, name] of chips) {
		const face = await faceIn(FILE, chip);
		expect(face?.dom.querySelector('.env-head')).toBeNull();
		expect(face?.dom.querySelector('.env-label')?.textContent).toBe(name);
	}
});

it('draws the head when the maker is given only arguments the data says leave it as it is', async () => {
	const file = `${FILE}\n#let remark = thmbox("remark", "Remark", fill: rgb("#eef"), inset: 1em)`;
	const head = (await faceIn(file, '#remark("Snake Lemma")[It holds.]'))?.dom.querySelector('.env-head');
	expect(head?.textContent).toBe('Remark (Snake Lemma):');
});
