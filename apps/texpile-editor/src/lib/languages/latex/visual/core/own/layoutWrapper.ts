import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import { ownMacroDefinition } from './ownMacroFace.svelte';
import { readOwnMacroCall } from './ownMacroCall';

const LAYOUT_ONLY = /\\(?:par|noindent|indent)(?![a-zA-Z@])|\\vspace\*?\s*\{[^{}]*\}|[{}\s]/g;
const COMMAND = /\\([a-zA-Z@]+)/g;

export function wrappedArgument(name: string, source: string): string | null {
	const definition = ownMacroDefinition(name);
	if (!definition || definition.args !== 1 || definition.optional !== undefined) return null;
	const call = readOwnMacroCall(source, definition);
	if (call?.name !== name) return null;
	const printed = definition.def.replace(COMMAND, (all, command: string) => (commonFacts(command).declares === 'align' ? '' : all));
	return printed.replace(LAYOUT_ONLY, '') === '#1' ? (call.args[0]?.text ?? null) : null;
}
