// the macros and environments a parse reads: the document's package table, and unified-latex's code for what a
// signature cannot say
import { environmentInfo, macroInfo } from '@unified-latex/unified-latex-ctan';
import type * as Ast from '@unified-latex/unified-latex-types';
import type { ParseOptions } from '../types';
import type { DefinedMacro } from './definedMacros';
import { BASE_PACKAGE_TABLE, environmentRecordOf, macroRecordOf, type PackageTable } from './packageTable';

// unified-latex reads these with code of its own (\lstinline|x|, \tikz ...;), or parses their arguments as math
// (\frac, \sqrt), or they are not commands with names (^, _, \\)
const CODE_MACROS: Ast.MacroInfoRecord = {};
for (const [group, macros] of Object.entries(macroInfo))
	if (group !== 'beamer')
		for (const [name, entry] of Object.entries(macros))
			if (entry.argumentParser || entry.renderInfo?.inMathMode || !/^[a-zA-Z]+$/.test(name)) CODE_MACROS[name] = entry;

// unified-latex splits list bodies into items and marks math environments; their signatures come from the table
const CODE_ENVIRONMENTS: Ast.EnvInfoRecord = Object.assign(
	{},
	...Object.entries(environmentInfo)
		.filter(([group]) => group !== 'beamer')
		.map(([, envs]) => envs)
);

function tableOf(options: ParseOptions): PackageTable {
	return options.table ?? BASE_PACKAGE_TABLE;
}

/** the commands the table gives, the ones valid only in math left to the math pass */
export function macroTable(options: ParseOptions): Ast.MacroInfoRecord {
	const table = tableOf(options);
	const record = { ...macroRecordOf(table) };
	for (const name of table.math) delete record[name];
	return { ...record, ...options.documentMacros, ...CODE_MACROS };
}

/** the commands valid only in math, which attach in math so an argument read as text (\begin{numcases}{\dot m_x})
 * does not give \dot the word m_ */
export function mathTable(options: ParseOptions): Ast.MacroInfoRecord {
	const table = tableOf(options);
	const record = macroRecordOf(table);
	return Object.fromEntries(table.math.filter((n) => n in record && !(n in (options.documentMacros ?? {}))).map((n) => [n, record[n]]));
}

export function environmentTable(options: ParseOptions): Ast.EnvInfoRecord {
	const out: Ast.EnvInfoRecord = { ...CODE_ENVIRONMENTS };
	for (const [name, entry] of Object.entries(environmentRecordOf(tableOf(options)))) out[name] = { ...out[name], ...entry };
	return out;
}

/** the names a document's definitions never replace */
export function codeMacroNames(): Set<string> {
	return new Set(Object.keys(CODE_MACROS));
}

/** the definitions that replace an entry the table reads differently; a redefinition without parameters keeps the
 * table's arguments, since it hands them to a command it calls (\renewcommand\section{\@startsection...}), and
 * \providecommand leaves a command the table has as it is, as TeX does */
export function replacedBy(options: ParseOptions, definitions: DefinedMacro[]): Ast.MacroInfoRecord {
	const table = { ...macroTable(options), ...mathTable(options) };
	const replaced: Ast.MacroInfoRecord = {};
	for (const { name, signature, defines } of definitions) {
		const keeps = defines === 'provide' || (!signature && (defines === 'renew' || defines === 'replace'));
		if (name in table && !(name in CODE_MACROS) && !keeps && table[name].signature !== signature) replaced[name] ??= { signature };
	}
	return replaced;
}
