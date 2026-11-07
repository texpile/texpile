// @vitest-environment jsdom
// a glossary or acronym call drawn as the term the package prints, read from the entries the project registers
import { describe, it, expect } from 'vitest';
import { typstFace } from '$lib/languages/typst/visual/core/walk/typstFace';
import { scopeOfFile, typstScopeNow } from '$lib/languages/typst/visual/core/scope/fileScopeNow.svelte';

const GLOSSARY = '#import "@preview/glossarium:0.5.10": *\n';
const ENTRIES =
	'#let entries = ((key: "cpu", short: "CPU", long: "Central Processing Unit"), (key: "os", short: "OS"))\n#register-glossary(entries)\n';

async function textIn(file: string, chip: string, modules: Record<string, string> = {}, main?: string): Promise<string | undefined> {
	typstScopeNow.current = await scopeOfFile(file, null, { path: 'chapters/intro.typ', main, read: async (p) => modules[p] ?? null });
	return typstFace(chip)?.dom.textContent ?? undefined;
}

describe('glossary faces', () => {
	it('draws a call as the form the package prints after the first use, from the registered entry', async () => {
		const file = GLOSSARY + ENTRIES;
		expect(await textIn(file, '#gls("cpu")')).toBe('CPU');
		expect(await textIn(file, '#glspl("cpu")')).toBe('CPUs');
		expect(await textIn(file, '#Gls("os")')).toBe('OS');
		expect(await textIn(file, '#gls("cpu", first: true)')).toBe('Central Processing Unit (CPU)');
	});

	it('reads the entries from the main file when a chapter is open, and acronyms from a dictionary', async () => {
		const main = GLOSSARY + ENTRIES + '#include "chapters/intro.typ"\n';
		expect(await textIn(GLOSSARY, '#gls("cpu")', { 'main.typ': main }, 'main.typ')).toBe('CPU');
		const acronyms = '#import "@preview/acrostiche:0.7.0": *\n#init-acronyms(("HTML": ("Hypertext Markup Language",)))\n';
		expect(await textIn(acronyms, '#acrfull("HTML")')).toBe('Hypertext Markup Language (HTML)');
		expect(await textIn(acronyms, '#acr("HTML")')).toBe('HTML');
	});

	it('marks a key that the registered entries lack', async () => {
		const face = await (async () => {
			typstScopeNow.current = await scopeOfFile(GLOSSARY + ENTRIES, null);
			return typstFace('#gls("gpu")');
		})();
		expect(face?.dom.innerHTML).toContain('drawn-glossary-missing');
	});

	it('leaves a call with an argument the data does not explain as code', async () => {
		expect(await textIn(GLOSSARY + ENTRIES, '#gls("cpu", suffix: [x])')).toBeUndefined();
	});
});
