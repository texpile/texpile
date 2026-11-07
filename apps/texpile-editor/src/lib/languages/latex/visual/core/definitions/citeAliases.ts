// natbib's \defcitealias{key}{text}: a definer that gives a citation key a short name, printed by \citetalias and \citepalias
import { callsIn, commonCommand, rolesOf } from '$lib/languages/latex/knowledge/calls/commandCalls';
import type { Argument } from '$lib/languages/latex/knowledge/types';
import { codeOnly } from '$lib/languages/latex/texCode';

/** a command that takes one citation key and a text */
export function isAliasDefiner(reading: readonly Argument[]): boolean {
	if (reading.length !== 2 || reading.some((a) => a.kind !== 'm')) return false;
	const [key, text] = reading;
	return rolesOf(key).includes('citekey') && !key.list && key.defines === undefined && rolesOf(text).includes('text');
}

/** the key to alias text, from every definer in `text` */
export function citeAliasesIn(text: string): Record<string, string> {
	const out: Record<string, string> = {};
	const code = codeOnly(text);
	for (const call of callsIn(code, ['citekey'])) {
		const reading = commonCommand(call.command);
		if (!reading || !isAliasDefiner(reading.args)) continue;
		const [key, alias] = call.args;
		if (key && alias && key.values[0]) out[key.values[0].value] = text.slice(alias.from, alias.to).trim();
	}
	return out;
}
