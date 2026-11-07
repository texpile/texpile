import { commandsOpeningMode } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import { kernelMathOnly } from '$lib/languages/latex/knowledge/commands/kernelCommands';
import { BASE_PACKAGE_TABLE } from '$lib/languages/latex/parser/signatures/packageTable';
import { ownMacroDefinition } from '../own/ownMacroFace.svelte';
import { oneLine } from './texSource';

const MATH_ONLY = new Set([...BASE_PACKAGE_TABLE.math, ...commandsOpeningMode('math')]);
const MOST_DEPTH = 3;

function mathCommand(name: string, depth: number): boolean {
	if (MATH_ONLY.has(name) || kernelMathOnly(name) || commonFacts(name).mathClass != null) return true;
	const own = depth < MOST_DEPTH ? ownMacroDefinition(name) : null;
	return !!own && bodyIsMath(own.def, depth + 1);
}

export function bodyIsMath(body: string, depth = 0): boolean {
	const code = oneLine(body).replace(/\\[{}%$&#_^]/g, '');
	if (code.includes('$')) return false;
	if (/[_^]/.test(code)) return true;
	for (const found of code.matchAll(/\\([a-zA-Z@]+)/g)) if (mathCommand(found[1], depth)) return true;
	return false;
}
