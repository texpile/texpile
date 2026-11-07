// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { typstFace } from '$lib/languages/typst/visual/core/walk/typstFace';
import {
	followTypstImports,
	rereadTypstProject,
	typstNamesNow,
	typstScopeNow
} from '$lib/languages/typst/visual/core/scope/fileScopeNow.svelte';

function projectOf(path: string, modules: Record<string, string> = {}, main: string | null = null) {
	return { path, main, read: async (p: string) => modules[p] ?? null };
}

describe('the open file scope', () => {
	it('draws an own call again in place when its let changes, and every chip once a pause after a name does', async () => {
		const project = projectOf('own.typ');
		followTypstImports('#let ie = [i.e.]\n#let eg = [e.g.]\nText #ie.\n', null, project);
		await vi.waitFor(() => expect(typstFace('#ie')?.dom.textContent).toBe('i.e.'));
		const face = typstFace('#ie');
		const names = typstNamesNow.current;
		followTypstImports('#let ie = [\n  that is\n]\n#let eg = [e.g.]\nText #ie.\n', null, project);
		expect(face?.dom.textContent).toBe('that is');
		followTypstImports('#let ie = [\n  that is\n]\n#let eg = [for example]\nText #ie.\n', null, project);
		for (const typed of ['e', 'ex', 'exa', 'exam'])
			followTypstImports(`#let ie = [\n  that is\n]\n#let ${typed} = [for example]\nText #ie.\n`, null, project);
		expect(typstNamesNow.current).toBe(names);
		await vi.waitFor(() => expect(typstNamesNow.current).toBe(names + 1));
		face?.destroy?.();
	});

	it('reads lets off the syntax tree, past a bracket in a comment and in names beyond ASCII', async () => {
		const project = projectOf('tree.typ');
		followTypstImports('#let a = 1 // see (below\n#let 定理 = [OLD]\nText #定理\n', null, project);
		await vi.waitFor(() => expect(typstFace('#定理')?.dom.textContent).toBe('OLD'));
		const face = typstFace('#定理');
		followTypstImports('#let a = 1 // see (below\n#let 定理 = [NEW]\nText #定理\n', null, project);
		expect(face?.dom.textContent).toBe('NEW');
		face?.destroy?.();
	});

	it('draws every chip again when a let a call shown as code reads turns drawable', async () => {
		const project = projectOf('code.typ');
		followTypstImports('#let ie = context { counter(page).get().first() }\nText #ie.\n', null, project);
		await vi.waitFor(() => expect(typstScopeNow.current?.own('ie')).toBeTruthy());
		expect(typstFace('#ie')).toBeNull();
		const names = typstNamesNow.current;
		followTypstImports('#let ie = [i.e.]\nText #ie.\n', null, project);
		await vi.waitFor(() => expect(typstNamesNow.current).toBeGreaterThan(names));
		expect(typstFace('#ie')?.dom.textContent).toBe('i.e.');
	});

	it('reads the project again after another file changes, and an import item added on a later line', async () => {
		const modules = { 'lib.typ': '#let note(x) = [OLD #x]\n#let bar = [BAR]\n' };
		const project = projectOf('ch.typ', modules);
		followTypstImports('#import "lib.typ": (\n  note,\n)\n#note[a] #bar\n', null, project);
		await vi.waitFor(() => expect(typstFace('#note[a]')?.dom.textContent).toBe('OLD a'));
		modules['lib.typ'] = '#let note(x) = [NEW #x]\n#let bar = [BAR]\n';
		rereadTypstProject();
		await vi.waitFor(() => expect(typstFace('#note[a]')?.dom.textContent).toBe('NEW a'));
		followTypstImports('#import "lib.typ": (\n  note, bar,\n)\n#note[a] #bar\n', null, project);
		await vi.waitFor(() => expect(typstFace('#bar')?.dom.textContent).toBe('BAR'));
	});
});
