import { m } from '$lib/paraglide/messages';
import { loaderCalls, optionsOf, prefixOf } from '../../packages/loaderCommands';
import type { LatexCheck, LatexCheckInput, SourceProblem } from '../latexChecks';
import { closestName } from '../reading/editDistance';
import { optionKey } from '../reading/optionNames';
import { readCode } from '../reading/readCode';

type WrittenOption = { text: string; at: number };

// a comma inside braces belongs to the option's value
function splitOptions(list: string, from: number): WrittenOption[] {
	const out: WrittenOption[] = [];
	let depth = 0;
	let start = 0;
	function push(end: number) {
		const raw = list.slice(start, end);
		const text = raw.trim();
		if (text) out.push({ text, at: from + start + raw.indexOf(text) });
	}
	for (let i = 0; i < list.length; i++) {
		if (list[i] === '\\') i++;
		else if (list[i] === '{') depth++;
		else if (list[i] === '}') depth--;
		else if (list[i] === ',' && depth === 0) {
			push(i);
			start = i + 1;
		}
	}
	push(list.length);
	return out;
}

function optionsOfCall(code: string, call: ReturnType<typeof loaderCalls>[number]): WrittenOption[] {
	const names = call.args[0];
	const first = names.values[0];
	if (!first || optionsOf(code, call) === undefined) return [];
	const from = call.at + 1 + call.command.length;
	const bracket = /\[([^\]]*)\]/.exec(code.slice(from, first.at));
	return bracket ? splitOptions(bracket[1], from + bracket.index + 1) : [];
}

function unknownOptions(input: LatexCheckInput): SourceProblem[] {
	const problems: SourceProblem[] = [];
	const all = readCode(input.text);
	// packages load in the preamble
	const start = all.indexOf('\\begin{document}');
	const code = start < 0 ? all : all.slice(0, start);
	for (const call of loaderCalls(code, ['package', 'class'])) {
		// LaTeX 2.09 takes packages as class options
		if (call.command === 'documentstyle') continue;
		const names = call.args[0].values.map((v) => prefixOf(call.args[0].arg) + v.value);
		if (!names.length) continue;
		const isClass = prefixOf(call.args[0].arg) === 'class-';
		const own = names.map((n) => input.options.of.get(n));
		// a file whose data lists no options may take any
		if (own.some((o) => !o)) continue;
		for (const option of optionsOfCall(code, call)) {
			const key = optionKey(option.text);
			if (!key || /[\\#]/.test(key) || own.some((o) => o!.has(key))) continue;
			// LaTeX hands the class options to every package
			if (isClass && input.options.all.has(key)) continue;
			// the data lists the options most files declare; a name unlike any of them may be one it missed
			const close = closestName(key, isClass ? input.options.all : own.flatMap((o) => [...o!]));
			if (!close) continue;
			problems.push({
				rule: 'unknown-option',
				at: option.at,
				anchor: option.text.split('=')[0].trim().split('\n')[0],
				message: m.latex_check_unknown_option_close({ option: close }),
				fix: { kind: 'replace-text', text: close }
			});
		}
	}
	return problems;
}

export const unknownOptionCheck: LatexCheck = { id: 'unknown-option', run: unknownOptions };
