// citation keys point at their line in the .bib, with blank lines and comments between entries
import { it, expect } from 'vitest';
import { refreshProjectIntel } from '$lib/workspace/projectIntel';
import { projectIntelStore } from '$lib/stores/projectIntel';

it('gives each .bib entry the line it starts on', async () => {
	const bib = '% refs\n\n@article{a,\n  title = {A}\n}\n\n\n  @book{b,\n  title = {B}}\n@misc{c, title = {C}}\n';
	await refreshProjectIntel([], ['/w/refs.bib'], null, null, async () => bib);
	expect(projectIntelStore.current.bibEntries.map((e) => [e.key, e.line])).toEqual([
		['a', 3],
		['b', 8],
		['c', 10]
	]);
});

it('counts what a style file the project ships loads as loaded', async () => {
	const files: Record<string, string> = {
		'/w/main.tex': '\\documentclass{article}\n\\usepackage{ourstyle}\n\\begin{document}\n\\end{document}',
		'/w/ourstyle.sty': '\\RequirePackage{amsthm}'
	};
	const read = async (p: string) => {
		if (!(p in files)) throw new Error('ENOENT');
		return files[p];
	};
	await refreshProjectIntel([{ name: 'main.tex', path: '/w/main.tex', relPath: 'main.tex' }], [], null, '/w/main.tex', read);
	expect(projectIntelStore.current.packages.map((u) => u.name)).toContain('amsthm');
});

it('completes the commands of a style file the project ships, without its internals', async () => {
	const files: Record<string, string> = {
		'/w/main.tex': '\\documentclass{article}\n\\usepackage{ourstyle}\n\\begin{document}\n\\end{document}',
		'/w/ourstyle.sty': '\\newcommand{\\reviewnote}[2][Reviewer]{#1: #2}\n\\def\\our@helper{x}\n\\newenvironment{reviewbox}{}{}'
	};
	const read = async (p: string) => {
		if (!(p in files)) throw new Error('ENOENT');
		return files[p];
	};
	await refreshProjectIntel([{ name: 'main.tex', path: '/w/main.tex', relPath: 'main.tex' }], [], null, '/w/main.tex', read);
	const macros = projectIntelStore.current.macros.map((m) => [m.name, m.signature, m.file]);
	expect(macros).toContainEqual(['reviewnote', 'o m', '/w/ourstyle.sty']);
	expect(macros.map(([name]) => name)).not.toContain('our@helper');
	expect(projectIntelStore.current.envs.map((e) => e.name)).toContain('reviewbox');
});

it("takes what loads from the open document's tree, not from another document in the folder", async () => {
	const files: Record<string, string> = {
		'/w/paper.tex': '\\documentclass{article}\n\\usepackage{amsthm}\n\\begin{document}\n\\input{sec}\n\\end{document}',
		'/w/sec.tex': 'Some text.',
		'/w/talk.tex': '\\documentclass{beamer}\n\\usepackage{amssymb}\n\\begin{document}\n\\end{document}'
	};
	const read = async (p: string) => {
		if (!(p in files)) throw new Error('ENOENT');
		return files[p];
	};
	const tex = Object.keys(files).map((path) => ({ name: path.slice(3), path, relPath: path.slice(3) }));
	const names = () => projectIntelStore.current.packages.map((u) => u.name);
	await refreshProjectIntel(tex, [], null, '/w/sec.tex', read, null, '/w/paper.tex');
	expect(names()).toContain('amsthm');
	expect(names()).not.toContain('amssymb');
	await refreshProjectIntel(tex, [], null, '/w/talk.tex', read, null, '/w/paper.tex');
	expect(names()).toContain('amssymb');
	expect(names()).not.toContain('amsthm');
});
