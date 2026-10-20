import { m } from '$lib/paraglide/messages';
import { packageDefining } from '../../../knowledge/commands/packageFor';
import { fileIdOf } from '../../../knowledge/fileIds';
import { isDegraded } from '../../packages/loadedPackages';
import { mergeDefinedNames, readDefinitions } from '../reading/definedNames';
import { knownNames } from '../reading/knownNames';
import type { LatexCheck, LatexCheckInput, SourceProblem } from '../latexChecks';
import { readCode } from '../reading/readCode';

const TOKEN = /\\(?:([A-Za-z@]+)|[^A-Za-z@])/g;
const ENVIRONMENT_NAME = /^\s*\{([^{}]+)\}/;
// the tokens after these name a command that may not exist
const NAMES_ANOTHER = new Set(['ifdefined', 'ifx', 'let', 'futurelet', 'ifundefined', 'undefined']);

// a package or class with no data and no file in the folder may define anything; a library defines styles
function everyFileRead(input: LatexCheckInput): boolean {
	return input.uses.every(
		(u) => fileIdOf(u.name).startsWith('libraries/') || input.local.has(u.name) || input.loaded.some((f) => f.name === u.name)
	);
}

function mergeSpans(spans: [number, number][]): [number, number][] {
	const out: [number, number][] = [];
	for (const [from, to] of spans.sort((a, b) => a[0] - b[0])) {
		const last = out.at(-1);
		if (last && from <= last[1]) last[1] = Math.max(last[1], to);
		else out.push([from, to]);
	}
	return out;
}

function undefinedNames(input: LatexCheckInput): SourceProblem[] {
	const { loaded, elsewhere } = input;
	if (!elsewhere || isDegraded(loaded) || !everyFileRead(input)) return [];
	const code = readCode(input.text);
	// LaTeX 2.09 takes packages as class options
	if (/\\documentstyle(?![A-Za-z])/.test(code)) return [];
	// a fragment of an unknown document takes its macros from files that are not known
	if (!input.main && !/\\begin\s*\{document\}/.test(code)) return [];
	const read = readDefinitions(code);
	const own = mergeDefinedNames([elsewhere, read]);
	if (own.dynamic) return [];
	const names = knownNames(loaded);
	const loadedNames = new Set(loaded.map((f) => f.name));
	function defined(name: string): boolean {
		return (
			names.has(name) ||
			input.possible.has(name) ||
			own.names.has(name) ||
			own.prefixes.some((p) => name.startsWith(p)) ||
			(name.startsWith('end') && defined(name.slice(3)))
		);
	}
	const spans = mergeSpans([...read.spans]);
	let span = 0;
	let skip = 0;
	const seen = new Set<string>();
	const problems: SourceProblem[] = [];
	function report(name: string, kind: 'command' | 'environment', at: number, anchor: string): void {
		if (seen.has(name)) return;
		seen.add(name);
		const pkg = packageDefining(kind, name);
		// a loaded package that defines it under an option or a condition: the reading is not certain
		if (pkg && loadedNames.has(pkg)) return;
		const label = kind === 'command' ? `\\${name}` : name;
		const message = pkg
			? kind === 'command'
				? m.latex_check_undefined_command_from({ name: label, pkg })
				: m.latex_check_undefined_environment_from({ name: label, pkg })
			: kind === 'command'
				? m.latex_check_undefined_command_none({ name: label })
				: m.latex_check_undefined_environment_none({ name: label });
		problems.push({
			rule: 'undefined-command',
			at,
			anchor,
			message,
			...(pkg ? { fix: { kind: 'add-package', name: pkg, ...(input.main && !input.isMain ? { into: input.main } : {}) } } : {})
		});
	}
	// TeX stops reading at \end{document}
	const stop = code.search(/\\end\s*\{document\}/);
	for (const match of code.matchAll(TOKEN)) {
		const name = match[1];
		if (!name) continue;
		const at = match.index;
		if (stop >= 0 && at >= stop) break;
		while (span < spans.length && spans[span][1] <= at) span++;
		// the names a \let or a test takes count off even inside a definition
		if (skip > 0) {
			skip--;
			continue;
		}
		if (NAMES_ANOTHER.has(name)) skip = 2;
		if (span < spans.length && spans[span][0] <= at) continue;
		if (name.includes('@')) continue;
		if (name === 'begin') {
			const open = ENVIRONMENT_NAME.exec(code.slice(at + match[0].length, at + match[0].length + 200));
			const env = open?.[1].trim();
			if (env && !/[\\#]/.test(env) && !defined(env) && !defined(env.replace(/\*$/, ''))) {
				report(env, 'environment', at + match[0].length + open![0].indexOf(env), env);
			}
			continue;
		}
		if (!defined(name)) report(name, 'command', at, `\\${name}`);
	}
	return problems;
}

export const undefinedCommandCheck: LatexCheck = { id: 'undefined-command', run: undefinedNames };
