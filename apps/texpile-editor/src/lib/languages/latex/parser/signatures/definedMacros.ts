// the commands a text defines whose definer states their arguments, as the parse reads them
import { commonCommand, rolesOf } from '../../knowledge/calls/commandCalls';
import type { Definition } from '../../knowledge/calls/definitions';
import type { Role } from '../../knowledge/types';
import { codeOnly } from '../../texCode';
import { definedIn, signatureOf } from '../../userDefinitions';

export type DefinedMacro = { name: string; signature: string; defines: Definition['defines']; body?: string };

const STATING: Role[] = ['arity', 'spec', 'default', 'body'];

// the argument kinds the parse reads; xparse's `v` and `b` and a `g` argument are left to the usage guess
const READABLE = /^(m|o|s|t.|[dr]..|e\{[^}]*\})$/;

// \newlength and kin state that the command takes nothing; \DeclareCiteCommand says nothing
function statesSignature(definition: Definition): boolean {
	const args = commonCommand(definition.command)?.args ?? [];
	return args.some((a) => a.makes || rolesOf(a).some((r) => STATING.includes(r)));
}

/** the macros `text` defines, comments left out, in source order */
export function definedMacrosIn(text: string): DefinedMacro[] {
	return definedIn(codeOnly(text), 'macro')
		.filter((d) => statesSignature(d) && d.args.every((a) => READABLE.test(a.kind)))
		.map((d) => ({ name: d.name, signature: signatureOf(d.args), defines: d.defines, ...(d.body !== undefined ? { body: d.body } : {}) }));
}
