// file path completion inside \includegraphics/\input/\bibliography/etc, sourced from
// filePathStore (a flat, project-wide, root-relative file list). unlike LaTeX Workshop's
// directory-by-directory disk walk, the flat list already fuzzy-matches a whole relative path in
// one step, so there's no separate "select a directory to see its contents" chaining to port.
import { get } from 'svelte/store';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { filePathStore } from '$lib/stores/editorStore';

const IMG_EXTS = ['png', 'jpg', 'jpeg', 'pdf', 'eps', 'gif', 'svg', 'webp', 'bmp'];

// commands whose {...} arg is a file path, with the extensions each one wants
const FILE_CMD_EXTS: Record<string, string[]> = {
	includegraphics: IMG_EXTS,
	adjincludegraphics: IMG_EXTS,
	includesvg: ['svg'],
	includepdf: ['pdf'],
	input: ['tex'],
	include: ['tex'],
	includeonly: ['tex'],
	excludeonly: ['tex'],
	subfile: ['tex'],
	subfileinclude: ['tex'],
	bibliography: ['bib'],
	addbibresource: ['bib'],
	loadglsentries: ['tex'],
	markdownInput: ['md']
};

// these append .tex/.bib themselves, so the inserted path must drop the extension
// (\include{intro.tex} would make LaTeX look for intro.tex.tex)
const STRIP_EXT = new Set(['include', 'includeonly', 'excludeonly', 'bibliography']);

// build junk hidden from the commands that take any extension (lstinputlisting etc.)
const JUNK_PATH = /\.(?:aux|log|out|toc|lof|lot|bbl|blg|fls|fdb_latexmk|synctex(?:\.gz)?|xdv|nav|snm|vrb)$/i;

const CMD_NAMES = [...Object.keys(FILE_CMD_EXTS), 'lstinputlisting', 'verbatiminput', 'inputminted'];
const FILEPATH_BEFORE = new RegExp(`\\\\(${CMD_NAMES.join('|')})\\*?(?:\\[[^\\]]*\\])*\\{[^{}]*$`);
// \import{dir}{file} family: the file sits in the SECOND brace group
const IMPORT_BEFORE = /\\(?:sub)?(?:import|includefrom|inputfrom)\*?\{[^{}]*\}\{[^{}]*$/;

const GRAPHICSPATH = /\\graphicspath\s*\{((?:\s*\{[^{}]*\}\s*)+)\}/g;

function graphicsDirs(text: string): string[] {
	const dirs: string[] = [];
	GRAPHICSPATH.lastIndex = 0;
	for (let m = GRAPHICSPATH.exec(text); m; m = GRAPHICSPATH.exec(text))
		for (const d of m[1].matchAll(/\{([^{}]*)\}/g)) if (d[1]) dirs.push(d[1].replace(/^\.\//, ''));
	return dirs;
}

// match on "basename path" (CM's fuzzy matcher doesn't treat / as a word boundary, so a lone
// first letter of the filename would never match the bare path), show the path, insert `insert`
function pathOption(path: string, stripExt: boolean): Completion {
	const insert = stripExt ? path.replace(/\.[^./\\]+$/, '') : path;
	const base = path.replace(/\\/g, '/').split('/').pop() ?? path;
	return { label: base === path ? path : `${base} ${path}`, displayLabel: path, apply: insert, type: 'text' };
}

export function filePathCompletionSource(ctx: CompletionContext): CompletionResult | null {
	let file = ctx.matchBefore(FILEPATH_BEFORE);
	let cmd: string;
	if (file) {
		cmd = /\\([a-zA-Z]+)/.exec(file.text)?.[1] ?? '';
	} else {
		file = ctx.matchBefore(IMPORT_BEFORE);
		if (!file) return null;
		cmd = 'input'; // import-family file args take \input semantics (tex, extension optional)
	}
	let paths = get(filePathStore);
	if (!paths.length) return null;
	const exts = FILE_CMD_EXTS[cmd];
	paths = exts ? paths.filter((p) => exts.some((e) => p.toLowerCase().endsWith('.' + e))) : paths.filter((p) => !JUNK_PATH.test(p));
	if ((cmd === 'includegraphics' || cmd === 'adjincludegraphics' || cmd === 'includesvg') && paths.length) {
		// a \graphicspath makes dir-relative names resolvable; offer those next to the full paths
		const dirs = graphicsDirs(ctx.state.doc.toString());
		if (dirs.length) {
			const relative = paths.flatMap((p) => dirs.filter((d) => p.startsWith(d)).map((d) => p.slice(d.length).replace(/^[/\\]/, '')));
			paths = [...new Set([...relative, ...paths])];
		}
	}
	// comma lists (\includeonly{a,b}): complete the token after the last separator
	const seg = Math.max(file.text.lastIndexOf('{'), file.text.lastIndexOf(','));
	const from = file.from + seg + 1;
	const strip = STRIP_EXT.has(cmd);
	return { from, options: paths.map((p) => pathOption(p, strip)), validFor: /^[^{},]*$/ };
}
