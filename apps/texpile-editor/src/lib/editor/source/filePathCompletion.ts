// file path completion inside \includegraphics/\input/\bibliography/etc, sourced from
// filePathStore (a flat, project-wide, root-relative file list). unlike LaTeX Workshop's
// directory-by-directory disk walk, the flat list already fuzzy-matches a whole relative path in
// one step, so there's no separate "select a directory to see its contents" chaining to port.
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { dirOf, fileCallsIn, searchDirsIn } from '$lib/languages/latex/knowledge/calls/fileCommands';
import type { FileRole } from '$lib/languages/latex/knowledge/types';
import { rolesOf } from '$lib/languages/latex/knowledge/calls/commandCalls';
import type { Argument } from '$lib/languages/latex/knowledge/types';
import { graphicExtensionsFor } from '$lib/languages/latex/knowledge/registries/graphicExtensions';
import { compileEngine } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { LATEX_SIDECAR_RE } from '$lib/workspace/buildArtifacts';
import { filePathStore } from '$lib/stores/editorStore';

// build junk hidden from the commands that take any extension (lstinputlisting etc.). Shared with
// the markdown source completion: a .md file sits in the same project and sees the same artifacts.
export const JUNK_PATH = LATEX_SIDECAR_RE;

const COMPLETED_ROLES: FileRole[] = ['file', 'listing', 'graphic', 'bibfile'];
const CURSOR = '\u0001';

type OpenFileArgument = {
	from: number;
	exts: string[] | null;
	strip: boolean;
	list: boolean;
	graphic: boolean;
	under: string;
};

function acceptedExts(arg: Argument): string[] | null {
	if (rolesOf(arg).includes('listing')) return null;
	const dotted = arg.ext ? [arg.ext] : arg.accepts;
	if (dotted) return dotted.map((e) => e.slice(1));
	return rolesOf(arg).includes('graphic') ? [...new Set(graphicExtensionsFor(compileEngine()).map((e) => e.slice(1).toLowerCase()))] : null;
}

function openFileArgument(before: string, lineStart: number): OpenFileArgument | null {
	for (const call of fileCallsIn(before + CURSOR + '}', COMPLETED_ROLES)) {
		const file = call.args.find((a) => a.values.some((v) => v.value.endsWith(CURSOR)));
		const value = file?.values.find((v) => v.value.endsWith(CURSOR));
		if (!file || !value || !rolesOf(file.arg).some((r) => COMPLETED_ROLES.includes(r as FileRole))) continue;
		if (!/[{,]\s*$/.test(before.slice(0, value.at))) continue;
		const dir = file.arg.from === 'file' ? '' : dirOf(call, file).replace(/^\.\//, '');
		return {
			from: lineStart + value.at,
			exts: acceptedExts(file.arg),
			strip: file.arg.appends === 'always',
			list: file.arg.list === true,
			graphic: rolesOf(file.arg).includes('graphic'),
			under: dir && !dir.endsWith('/') ? `${dir}/` : dir
		};
	}
	return null;
}

function searchPathDirs(text: string): string[] {
	return searchDirsIn(text)
		.map((d) => d.replace(/^\.\//, ''))
		.filter(Boolean);
}

// match on "basename path" (CM's fuzzy matcher doesn't treat / as a word boundary, so a lone
// first letter of the filename would never match the bare path), show the path, insert `insert`
export function pathOption(path: string, stripExt: boolean): Completion {
	const insert = stripExt ? path.replace(/\.[^./\\]+$/, '') : path;
	const base = path.replace(/\\/g, '/').split('/').pop() ?? path;
	return { label: base === path ? path : `${base} ${path}`, displayLabel: path, apply: insert, type: 'text' };
}

export function filePathCompletionSource(ctx: CompletionContext): CompletionResult | null {
	const line = ctx.state.doc.lineAt(ctx.pos);
	const before = line.text.slice(0, ctx.pos - line.from);
	if (!before.includes('\\')) return null;
	const target = openFileArgument(before, line.from);
	if (!target) return null;
	let paths = filePathStore.current;
	if (target.under) paths = paths.filter((p) => p.startsWith(target.under)).map((p) => p.slice(target.under.length));
	if (!paths.length) return null;
	const { exts } = target;
	paths = exts ? paths.filter((p) => exts.some((e) => p.toLowerCase().endsWith('.' + e))) : paths.filter((p) => !JUNK_PATH.test(p));
	if (target.graphic && paths.length) {
		// a \graphicspath makes dir-relative names resolvable; offer those next to the full paths
		const dirs = searchPathDirs(ctx.state.doc.toString());
		if (dirs.length) {
			const relative = paths.flatMap((p) => dirs.filter((d) => p.startsWith(d)).map((d) => p.slice(d.length).replace(/^[/\\]/, '')));
			paths = [...new Set([...relative, ...paths])];
		}
	}
	return { from: target.from, options: paths.map((p) => pathOption(p, target.strip)), validFor: target.list ? /^[^{},]*$/ : /^[^{}]*$/ };
}
