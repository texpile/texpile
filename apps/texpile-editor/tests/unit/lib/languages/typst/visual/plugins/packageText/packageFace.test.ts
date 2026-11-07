// @vitest-environment jsdom
// a package's call drawn as what the bundled data says it prints, once the file's imports (its own, or a project
// module's) are read; a name nothing imports stays code
import { describe, it, expect } from 'vitest';
import { typstFace } from '$lib/languages/typst/visual/core/walk/typstFace';
import { scopeOfFile, typstScopeNow } from '$lib/languages/typst/visual/core/scope/fileScopeNow.svelte';

async function faceIn(file: string, chip: string, modules: Record<string, string> = {}) {
	typstScopeNow.current = await scopeOfFile(file, null, { path: 'chapters/intro.typ', read: async (p) => modules[p] ?? null });
	return typstFace(chip);
}

describe('package faces', () => {
	it('draws a glossary call as its key when nothing in the project registers entries', async () => {
		const face = await faceIn('#import "@preview/glossarium:0.5.10": *\n', '#gls("SE")');
		expect(face?.dom.textContent).toBe('SE');
		expect(face?.dom.innerHTML).not.toContain('drawn-glossary-missing');
	});

	it('follows a project module that re-exports the package', async () => {
		const modules = { 'preamble.typ': '#import "@preview/glossarium:0.5.10": *\n#let mine = 1\n' };
		const face = await faceIn('#import "../preamble.typ": *\n', '#glspl("OS")', modules);
		expect(face?.dom.textContent).toBe('OS');
	});

	it('draws a value as its text and a call as its argument, and leaves an unimported name as code', async () => {
		const file = '#import "@preview/blind-cvpr:0.7.0": *\n#import "@preview/boxed-sheet:0.1.2": *\n';
		expect((await faceIn(file, '#etal'))?.dom.textContent).toBe('et al');
		expect((await faceIn(file, '#inline("On page script")'))?.dom.textContent).toBe('On page script');
		expect(await faceIn('= Title\n', '#gls("SE")')).toBeNull();
	});

	it('draws a value that only updates a state as a quiet note of its name', async () => {
		const face = await faceIn('#import "@preview/algo:0.3.6": algo, i\n', '#i');
		expect(face?.dom.className).toContain('drawn-typst-quiet');
	});
});
