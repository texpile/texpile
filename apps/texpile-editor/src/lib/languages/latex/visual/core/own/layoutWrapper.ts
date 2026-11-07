// a macro the paper defines that only sets its one argument in a paragraph of its own (LyX's \lyxaddress)
import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import { ownMacroDefinition } from './ownMacroFace.svelte';
import { readOwnMacroCall } from './ownMacroCall';

// what lays out a paragraph and prints nothing: paragraph breaks and indents, a vertical space, braces and blanks
const LAYOUT_ONLY = /\\(?:par|noindent|indent)(?![a-zA-Z@])|\\vspace\*?\s*\{[^{}]*\}|[{}\s]/g;
const COMMAND = /\\([a-zA-Z@]+)/g;

/** the text of the call's argument when the definition of `name` prints nothing but it, else null */
export function wrappedArgument(name: string, source: string): string | null {
	const definition = ownMacroDefinition(name);
	if (!definition || definition.args !== 1 || definition.optional !== undefined) return null;
	const call = readOwnMacroCall(source, definition);
	if (call?.name !== name) return null;
	// an alignment switch aligns the paragraph and prints nothing
	const printed = definition.def.replace(COMMAND, (all, command: string) => (commonFacts(command).declares === 'align' ? '' : all));
	return printed.replace(LAYOUT_ONLY, '') === '#1' ? (call.args[0]?.text ?? null) : null;
}
