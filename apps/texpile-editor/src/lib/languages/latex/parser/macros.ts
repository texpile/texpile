// what the import drops (ignoredMacros) and what keeps its braces (isScopedSwitch)
import { commonFacts } from '../knowledge/commands/commandFacts';

/**
 * Macros dropped entirely. ONLY genuinely no-output commands belong here: anything that affects
 * rendering must fall through to raw and round-trip verbatim instead. that includes \vspace and
 * friends, \setlength, definition macros (\newcommand, \documentclass, ...), \label (dropping
 * one silently breaks \ref/\cref), \pagenumbering, and \makeatletter/\makeatother (the @ catcode
 * is load-bearing for any @-named command inside; dropping the wrapper broke compilation).
 */
export const ignoredMacros = new Set(['def', 'let', 'ifdefempty']);

// the notes serializer emits its own {\small ...}, so these four are stripped from table notes (a product choice)
export const FONT_SIZE_SWITCHES = new Set(['tiny', 'scriptsize', 'footnotesize', 'small']);

// a {...} group scoping a switch keeps its braces so the switch cannot leak
export function isScopedSwitch(name: string): boolean {
	return commonFacts(name).declares != null;
}
