// where a source file defines a label or a command, for the jump from a drawn chip
import { codeOnly } from '$lib/languages/latex/texCode';
import { findMacroDefinition } from '$lib/languages/latex/intellisense/definition';
import { keysIn } from '$lib/languages/latex/knowledge/calls/roleKeys';

function lineOf(source: string, offset: number): number {
	return source.slice(0, offset).split('\n').length;
}

/** 1-based line of the call that defines the label `name` in `source`, or null */
export function labelLine(source: string, name: string): number | null {
	const hit = keysIn(codeOnly(source), 'label', true).find((d) => d.key === name);
	return hit ? lineOf(source, hit.call.at) : null;
}

/** 1-based line where `source` defines the command `\name` (\newcommand, \def, \NewDocumentCommand and kin), or null */
export function definitionLine(source: string, name: string): number | null {
	const offset = findMacroDefinition(source, name);
	return offset === null ? null : lineOf(source, offset);
}
