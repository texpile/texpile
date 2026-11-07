// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { typstFace } from '$lib/languages/typst/visual/core/walk/typstFace';
import { scopeOfFile, typstScopeNow } from '$lib/languages/typst/visual/core/scope/fileScopeNow.svelte';

async function faceIn(file: string, chip: string, modules: Record<string, string> = {}, main: string | null = null) {
	typstScopeNow.current = await scopeOfFile(file, null, { path: 'chapters/intro.typ', main, read: async (p) => modules[p] ?? null });
	return typstFace(chip);
}

describe('own function faces', () => {
	it('draws a call with its argument put into the body', async () => {
		const face = await faceIn('#let paragraph(title) = [*#title* #h(1em)]\n', '#paragraph[Distributed computing]');
		expect(face?.dom.querySelector('strong')?.textContent).toBe('Distributed computing');
		expect(face?.line).toBeFalsy();
		const value = await faceIn('#let ie = [_i.e._,]\n', '#ie');
		expect(value?.dom.querySelector('em')?.textContent).toBe('i.e.');
		expect(value?.dom.textContent).toBe('i.e.,');
	});

	it('draws a .with alias from a module, its body as a block, and the main file names a chapter does not bind', async () => {
		const modules = {
			'lib.typ': '#let note(body, title: "Note") = block[*#title.* #body\n\n#h(1em)]\n',
			'main.typ': '#import "lib.typ": *\n#let remark = note.with(title: "Remark")\n#include "chapters/intro.typ"\n'
		};
		const face = await faceIn('= Intro\n', '#remark[A short remark.]', modules, 'main.typ');
		expect(face?.line).toBe(true);
		expect(face?.dom.textContent).toContain('Remark. A short remark.');
	});

	it('leaves a body Typst has to run as code', async () => {
		const file = '#let pageref(l) = context { counter(page).at(l).first() }\n#let twice(..xs) = xs.pos().join()\n';
		expect(await faceIn(file, '#pageref(<x>)')).toBeNull();
		expect(await faceIn(file, '#twice[a][b]')).toBeNull();
	});

	it('draws only a theorem a package makes as its name over its content', async () => {
		const file =
			'#import "@preview/ctheorems:1.1.3": *\n#let lemma = thmbox("lemma", "Lemma")\n#let cfg(body) = text(font: "Consolas", [[#body]])\n#let todo(body) = context { text(red, body) }\n';
		expect((await faceIn(file, '#lemma[It holds.]'))?.dom.querySelector('.env-head strong')?.textContent).toBe('Lemma');
		expect((await faceIn(file, '#cfg[start]'))?.dom.textContent).toBe('[start]');
		const made = '#let box-of(title) = (body) => block[*#title.* #body]\n#let claim = box-of("Claim")\n';
		expect((await faceIn(made, '#claim[It holds.]'))?.dom.querySelector('.env-label')?.textContent).toBe('claim');
		expect(await faceIn(file, '#todo[x]')).toBeNull();
	});

	it('puts a content argument in as one value', async () => {
		const face = await faceIn('#let paragraph(title) = [*#title*]\n', '#paragraph[Sec *one* two]');
		expect(face?.dom.textContent).toBe('Sec one two');
		const texts = document.createTreeWalker(face!.dom, NodeFilter.SHOW_TEXT);
		const loose: string[] = [];
		while (texts.nextNode()) if (!texts.currentNode.parentElement?.closest('strong')) loose.push(texts.currentNode.textContent!);
		expect(loose).toEqual([]);
	});

	it('reads a body in the file that defines it, and a name the file lets as its own', async () => {
		const modules = { 'chapters/lib.typ': '#let helper(x) = strong(x)\n#let note(x) = helper(x)\n' };
		const face = await faceIn('#import "lib.typ": note\n#let helper(x) = [OPENFILE #x]\n', '#note[a]', modules);
		expect(face?.dom.textContent).toBe('a');
		expect(face?.dom.querySelector('strong')?.textContent).toBe('a');
		expect((await faceIn('#let footnote(x) = [(#x)]\n', '#footnote[a]'))?.dom.textContent).toBe('(a)');
		const caller = await faceIn('#import "lib.typ": note2\n#let iff = [iff]\n', '#note2[a #iff b]', {
			'chapters/lib.typ': '#let note2(x) = [Note: #x]\n'
		});
		expect(caller?.dom.textContent).toBe('Note: a iff b');
	});
});
