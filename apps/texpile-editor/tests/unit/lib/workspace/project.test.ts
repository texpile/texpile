import { describe, it, expect, vi, beforeEach } from 'vitest';

// in-memory filesystem the mocked fileSystem serves; keys are absolute paths (forward slashes)
const h = vi.hoisted(() => ({ fs: {} as Record<string, string> }));

vi.mock('../../../../src/lib/workspace/fileSystem', () => {
	const norm = (p: string) => p.replace(/\\/g, '/');
	return {
		pathKey: norm,
		readTextFile: async (path: string): Promise<string> => {
			const want = norm(path).toLowerCase();
			const hit = Object.keys(h.fs).find((k) => norm(k).toLowerCase() === want);
			if (hit === undefined) throw new Error('ENOENT: ' + path);
			return h.fs[hit];
		},
		dirname: (path: string): string => {
			const parts = norm(path).split('/');
			parts.pop();
			return parts.join('/');
		},
		joinPath: (dir: string, rel: string): string => {
			if (!dir) return rel;
			return `${dir.replace(/[\\/]+$/, '')}/${rel.replace(/^[\\/]+/, '')}`;
		}
	};
});

import { detectMainFile, gatherProjectMacros } from '../../../../src/lib/workspace/project';
import * as LatexParser from '$lib/languages/latex/parser/latexParser';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';

const ROOT = '/proj';
const file = (rel: string) => ({ name: rel.split('/').pop()!, path: `${ROOT}/${rel}`, relPath: rel });

beforeEach(() => {
	h.fs = {};
});

describe('detectMainFile', () => {
	it('does not take a chapter that mentions the wrapper in \\verb for a root', async () => {
		h.fs = {
			'/proj/chapter.tex': 'Split at \\verb|\\begin{document}| and \\verb|\\end{document}|.',
			'/proj/thesis-root.tex': '\\documentclass{book}\n\\begin{document}\n\\input{chapter}\n\\end{document}\n'
		};
		expect(await detectMainFile([file('chapter.tex'), file('thesis-root.tex')])).toBe('/proj/thesis-root.tex');
	});

	it('returns the only file when there is one', async () => {
		h.fs = { '/proj/whatever.tex': 'no doc here' };
		expect(await detectMainFile([file('whatever.tex')])).toBe('/proj/whatever.tex');
	});

	it('picks the file that actually has \\begin{document} over fragments', async () => {
		h.fs = {
			'/proj/sectionA.tex': '\\section{A}\nbody',
			'/proj/root.tex': '\\documentclass{article}\n\\begin{document}\nhi\n\\end{document}',
			'/proj/sectionB.tex': '\\section{B}\nbody'
		};
		expect(await detectMainFile([file('sectionA.tex'), file('root.tex'), file('sectionB.tex')])).toBe('/proj/root.tex');
	});

	it('prefers a conventional name (main.tex) when several files have \\begin{document}', async () => {
		const doc = '\\documentclass{article}\n\\begin{document}\nx\n\\end{document}';
		h.fs = { '/proj/aaa.tex': doc, '/proj/main.tex': doc };
		expect(await detectMainFile([file('aaa.tex'), file('main.tex')])).toBe('/proj/main.tex');
	});

	it('ignores a \\begin{document} that is only inside a comment', async () => {
		h.fs = {
			'/proj/frag.tex': '% \\begin{document} (standalone-only)\n\\section{x}',
			'/proj/real.tex': '\\documentclass{article}\n\\begin{document}\nx\n\\end{document}'
		};
		expect(await detectMainFile([file('frag.tex'), file('real.tex')])).toBe('/proj/real.tex');
	});

	it('returns null for an empty folder', async () => {
		expect(await detectMainFile([])).toBeNull();
	});
});

describe('gatherProjectMacros', () => {
	it('collects \\newcommand from the main file preamble', async () => {
		h.fs = {
			'/proj/main.tex': '\\documentclass{article}\n\\newcommand{\\foo}[1]{\\textbf{#1}}\n\\begin{document}\nbody\n\\end{document}'
		};
		const macros = await gatherProjectMacros('/proj/main.tex', ROOT);
		expect(macros).toContain('\\newcommand{\\foo}[1]{\\textbf{#1}}');
		// only the main file's preamble, never the body
		expect(macros).not.toContain('body');
	});

	it('follows \\input{commands} in the preamble and collects its macros', async () => {
		h.fs = {
			'/proj/main.tex': '\\documentclass{article}\n\\input{commands}\n\\begin{document}\n\\section{s}\n\\end{document}',
			'/proj/commands.tex': '\\newcommand{\\kw}[1]{\\texttt{#1}}\n'
		};
		const macros = await gatherProjectMacros('/proj/main.tex', ROOT);
		expect(macros).toContain('\\newcommand{\\kw}[1]{\\texttt{#1}}');
	});

	it('follows a project-local \\usepackage{mystyle} (.sty) but skips standard packages', async () => {
		h.fs = {
			'/proj/main.tex': '\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage{mystyle}\n\\begin{document}\n\\end{document}',
			'/proj/mystyle.sty': '\\newcommand{\\R}{\\mathbb{R}}\n'
		};
		const macros = await gatherProjectMacros('/proj/main.tex', ROOT);
		expect(macros).toContain('\\newcommand{\\R}{\\mathbb{R}}'); // local .sty pulled in
		// amsmath has no local file; resolveRead just fails and is skipped (no throw)
	});

	it('does NOT follow a body-level \\input (only the main file preamble is scanned)', async () => {
		h.fs = {
			'/proj/main.tex': '\\documentclass{article}\n\\begin{document}\n\\input{section1}\n\\end{document}',
			'/proj/section1.tex': '\\newcommand{\\shouldNotLeak}{x}\nprose'
		};
		const macros = await gatherProjectMacros('/proj/main.tex', ROOT);
		expect(macros).not.toContain('shouldNotLeak');
	});

	it('survives include cycles', async () => {
		h.fs = {
			'/proj/main.tex': '\\input{a}\n\\begin{document}\\end{document}',
			'/proj/a.tex': '\\newcommand{\\a}{1}\\input{b}',
			'/proj/b.tex': '\\newcommand{\\b}{2}\\input{a}' // cycles back to a
		};
		const macros = await gatherProjectMacros('/proj/main.tex', ROOT);
		expect(macros).toContain('\\newcommand{\\a}{1}');
		expect(macros).toContain('\\newcommand{\\b}{2}');
	});
});

describe('cross-file macros make a fragment round-trip its custom command', () => {
	// a 2-arg command with an optional arg written with a space before the bracket: usage-based
	// inference refuses a bracket that is not glued to the call (it would swallow prose), so only
	// the gathered signature attaches it. observed on the parsed doc: with the signature the whole
	// call is one raw chip, without it the bracket text is ordinary prose.
	const MACROS = '\\newcommand{\\hlnote}[2][TODO]{\\textbf{#1}: #2}\n';
	const FRAGMENT = 'Intro \\hlnote [Important]{check this} outro.';
	const chipsWith = (src: string, macros: string, text: string) => {
		const { doc } = LatexParser.latexToProseMirror(src, { preamble: macros });
		let n = 0;
		doc.descendants((node) => {
			if (node.type.name === 'inline_latex' && node.textContent.includes(text)) n++;
		});
		return n;
	};

	it('keeps the optional argument attached when the signature is supplied', () => {
		expect(chipsWith(FRAGMENT, MACROS, '[Important]{check this}')).toBe(1);
		expect(serializeToLatex(LatexParser.latexToProseMirror(FRAGMENT, { preamble: MACROS }).doc)).toContain('[Important]{check this}');
	});

	it('without the signature the bracket stays prose', () => {
		expect(chipsWith(FRAGMENT, '', '[Important]')).toBe(0);
	});
});
