// the signatures a document's loaded files give the parse
import type * as Ast from '@unified-latex/unified-latex-types';
import { BASE_TABLE } from '../../knowledge/bundledFiles';
import { conditionHolds, type LoadedFile } from '../../knowledge/loadedFiles';
import { stackedCommands, stackedEnvironments } from '../../knowledge/stackedEntries';
import type { Argument } from '../../knowledge/types';
import { loadedEnvFacts, type EnvFacts } from '../../knowledge/environments/envFacts';
import { signatureOfArgs } from './argSignature';
import { ACCENT_COMMANDS, SYMBOLS } from '../../knowledge/commands/texCharacters';
import { ignoredMacros } from '../macros';

/** command and environment names to their arguments, as the loaded files stack them ([] takes none, a name left out is
 * unknown); math: the commands valid only in math; bodies: what each environment's body is */
export type PackageTable = {
	macros: Record<string, Argument[]>;
	envs: Record<string, Argument[]>;
	math: string[];
	bodies: Record<string, EnvFacts>;
};

const tables = new WeakMap<LoadedFile[], PackageTable>();

const REQUIRED = /^[mrv]/;

function isSubsequence(short: string[], long: string[]): boolean {
	let i = 0;
	for (const k of long) if (k === short[i]) i++;
	return i === short.length;
}

/** `wide` reads every argument `narrow` reads and more optional ones */
export function widens(wide: Argument[], narrow: Argument[]): boolean {
	const w = wide.map((a) => a.kind);
	const n = narrow.map((a) => a.kind);
	return (
		w.length > n.length && isSubsequence(n, w) && w.filter((k) => REQUIRED.test(k)).length === n.filter((k) => REQUIRED.test(k)).length
	);
}

// a redefinition that drops optional arguments wraps the command below it (bibunits' \cite over natbib's \cite[pre][post]):
// the parse keeps reading them, since an optional argument the source does not write costs nothing
function widestArgs(loaded: LoadedFile[]): Map<string, Argument[]> {
	const widest = new Map<string, Argument[]>();
	for (const file of loaded)
		for (const layer of file.layers)
			for (const e of layer.macros ?? []) {
				if (!e.args || (e.if && !conditionHolds(e.if, file.options))) continue;
				const below = widest.get(e.name);
				if (!below || !widens(below, e.args)) widest.set(e.name, e.args);
			}
	return widest;
}

export function packageTableOf(loaded: LoadedFile[]): PackageTable {
	const cached = tables.get(loaded);
	if (cached) return cached;
	const table: PackageTable = { macros: {}, envs: {}, math: [], bodies: loadedEnvFacts(loaded) };
	const widest = widestArgs(loaded);
	for (const [name, e] of stackedCommands(loaded)) {
		if (!e.args || !/^[a-zA-Z]+$/.test(name)) continue;
		const wide = widest.get(name);
		table.macros[name] = wide && widens(wide, e.args) ? wide : e.args;
		if (e.in === 'math') table.math.push(name);
	}
	for (const [name, e] of stackedEnvironments(loaded)) if (e.args) table.envs[name] = e.args;
	tables.set(loaded, table);
	return table;
}

/** what a parse reads when the document's packages are unknown */
export const BASE_PACKAGE_TABLE: PackageTable = BASE_TABLE;

function signaturesIn(entries: Record<string, Argument[]>): Record<string, { signature: string }> {
	const out: Record<string, { signature: string }> = {};
	for (const [name, args] of Object.entries(entries)) {
		const signature = signatureOfArgs(args);
		if (signature !== null) out[name] = { signature };
	}
	return out;
}

const records = new WeakMap<PackageTable, { macros: Ast.MacroInfoRecord; envs: Ast.EnvInfoRecord }>();

function recordsOf(table: PackageTable): { macros: Ast.MacroInfoRecord; envs: Ast.EnvInfoRecord } {
	let out = records.get(table);
	if (!out) {
		const macros = signaturesIn(table.macros);
		// an accent's letter and a symbol word's space stay text beside the chip; a dropped command must not take what follows
		for (const name of Object.keys(macros))
			if (ACCENT_COMMANDS.has(name) || name in SYMBOLS || ignoredMacros.has(name)) delete macros[name];
		out = { macros, envs: signaturesIn(table.envs) };
		records.set(table, out);
	}
	return out;
}

/** the table as unified-latex's records, shared: copy before changing one */
export function macroRecordOf(table: PackageTable): Readonly<Ast.MacroInfoRecord> {
	return recordsOf(table).macros;
}

export function environmentRecordOf(table: PackageTable): Readonly<Ast.EnvInfoRecord> {
	return recordsOf(table).envs;
}
