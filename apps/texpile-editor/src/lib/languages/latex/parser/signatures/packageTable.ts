// the signatures a document's loaded files give the parse
import type * as Ast from '@unified-latex/unified-latex-types';
import type { LoadedFile } from '../../knowledge/loadedFiles';
import { stackedCommands, stackedEnvironments } from '../../knowledge/stackedEntries';
import type { Argument } from '../../knowledge/types';
import { signatureOfArgs } from './argSignature';

/** command and environment names to their arguments, as the loaded files stack them */
export type PackageTable = { macros: Record<string, Argument[]>; envs: Record<string, Argument[]> };

export function packageTableOf(loaded: LoadedFile[]): PackageTable {
	const table: PackageTable = { macros: {}, envs: {} };
	for (const [name, e] of stackedCommands(loaded)) if (e.args?.length && /^[a-zA-Z]+$/.test(name)) table.macros[name] = e.args;
	for (const [name, e] of stackedEnvironments(loaded)) if (e.args?.length) table.envs[name] = e.args;
	return table;
}

function signaturesIn(entries: Record<string, Argument[]>): Record<string, { signature: string }> {
	const out: Record<string, { signature: string }> = {};
	for (const [name, args] of Object.entries(entries)) {
		const signature = signatureOfArgs(args);
		if (signature) out[name] = { signature };
	}
	return out;
}

/** the table as unified-latex's records */
export function macroRecordOf(table: PackageTable): Ast.MacroInfoRecord {
	return signaturesIn(table.macros);
}

export function environmentRecordOf(table: PackageTable): Ast.EnvInfoRecord {
	return signaturesIn(table.envs);
}
