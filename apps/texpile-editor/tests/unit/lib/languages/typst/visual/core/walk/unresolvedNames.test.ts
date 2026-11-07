// @vitest-environment jsdom
// names the file's own scope could not find: a field of the paper's dictionary, a function a maker returns, and a name a
// package makes with a call
import { describe, it, expect } from 'vitest';
import { typstFace } from '$lib/languages/typst/visual/core/walk/typstFace';
import { scopeOfFile, typstScopeNow } from '$lib/languages/typst/visual/core/scope/fileScopeNow.svelte';
import type { PackageCacheReader } from '$lib/languages/typst/knowledge';

async function faceIn(file: string, chip: string, cache: PackageCacheReader | null = null) {
	typstScopeNow.current = await scopeOfFile(file, cache, { path: 'main.typ', read: async () => null });
	return typstFace(chip);
}

describe('names read through a dictionary or a maker', () => {
	it('draws a field of the paper dictionary, read by dot or by .at', async () => {
		const file = '#let z3 = (\n  display: smallcaps[Z3str3],\n  year: 2017,\n  "full-name": [Z3 string solver],\n)\n';
		expect((await faceIn(file, '#z3.display'))?.dom.textContent).toBe('Z3str3');
		expect((await faceIn(file, '#z3.year'))?.dom.textContent).toBe('2017');
		expect((await faceIn(file, '#z3.at("full-name")'))?.dom.textContent).toBe('Z3 string solver');
		expect(await faceIn(file, '#z3.missing')).toBeNull();
	});

	it('draws a function read off a maker call as its name over its content, also when the maker is called twice', async () => {
		const once = '#import "@preview/chengsi:0.1.2": environments\n#let env = environments(config: (:))\n';
		const face = await faceIn(once, '#(env.definition)(title: [Continuity])[A function is continuous.]');
		expect(face?.dom.querySelector('.env-label')?.textContent).toBe('env.definition');
		expect(face?.dom.textContent).toContain('A function is continuous.');
		const labelled = await faceIn(once, '#(env.theorem)(title: [x])[It holds.] <thm-a>');
		expect(labelled?.dom.textContent).toContain('It holds.');
		const twice = `${once}#let env = environments(config: (title: "x"))\n`;
		expect((await faceIn(twice, '#(env.proof)[Trivial.]'))?.dom.querySelector('.env-label')?.textContent).toBe('env.proof');
		const changed = `${once}#let env = (a: 1)\n`;
		expect(await faceIn(changed, '#(env.proof)[Trivial.]')).toBeNull();
	});

	it('draws a function a package makes with a call as its name over its content', async () => {
		const cache: PackageCacheReader = async () => ({
			'typst.toml': 'entrypoint = "lib.typ"\n',
			'lib.typ':
				'#import "@preview/ctheorems:1.1.3": *\n#let (sample, soln) = boxes("sample", "soln")\n#let thm = thmbox("thm", "Theorem")\n'
		});
		const file = '#import "@local/evan:1.0.0": *\n';
		expect((await faceIn(file, '#sample[One plus one.]', cache))?.dom.querySelector('.env-label')?.textContent).toBe('sample');
		expect((await faceIn(file, '#thm[Euler][We have it.]', cache))?.dom.textContent).toContain('We have it.');
		expect(await faceIn(file, '#sample', cache)).toBeNull();
	});

	it('keeps a name code when the value at the chip is not the one drawn', async () => {
		const twice = '#let box1(body) = text(red, body)\n#let box1(body) = strong(body)\n';
		expect(await faceIn(twice, '#box1[x]')).toBeNull();
		expect(await faceIn('#let a = (x: 1, ..over)\n', '#a.x')).toBeNull();
		expect((await faceIn('#let a = (..over, x: 1)\n', '#a.x'))?.dom.textContent).toBe('1');
		expect(await faceIn('#let d = ("a.b": [X], a: (b: [Y]))\n', '#d.at("a.b")')).toBeNull();
		expect(await faceIn('#let t = text(red)[Hello World]\n', '#t.fill')).toBeNull();
		expect(await faceIn('#let f(x) = (a: x)\n', '#f.a')).toBeNull();
	});

	it('draws the title of a call over a maker in the header', async () => {
		const file = '#import "@preview/chengsi:0.1.2": environments\n#let env = environments(config: (:))\n';
		const face = await faceIn(file, '#(env.definition)(title: [Continuity])[A function is continuous.]');
		expect(face?.dom.querySelector('.typ-env-heading')?.textContent).toBe('env.definition(Continuity)');
		const named = await faceIn(file, '#(env.theorem)(title: "Q")[It holds.]');
		expect(named?.dom.querySelector('.typ-env-title')?.textContent).toBe('(Q)');
		expect(await faceIn(file, '#(env.theorem)(title: some-title)[It holds.]')).toBeNull();
	});
});
