import { box } from '$lib/runes/box.svelte';
import type { MacroDef } from '$lib/editor/source/extensions/math-preview/userMacros';

/**
 * The document's own \newcommand definitions, in the form MathLive takes them.
 *
 * `expand: false` is the load-bearing part, not a nicety. The node view reads a field back with
 * getValue('latex-expanded'), which recursively replaces every macro with its definition, so
 * without the flag editing any equation containing \RR would write \mathbb{R} into the author's
 * source and lose the macro. Measured against mathlive 0.110: guarded, \RR+x survives the round
 * trip; unguarded, it comes back as \mathbb{R}+x.
 *
 * captureSelection keeps the caret out of the expansion, which has nowhere to map back to.
 */
export type GuardedMacro = { def: string; args: number; expand: false; captureSelection: true };

export const mathMacros = box<Record<string, GuardedMacro>>({});

export function guardMacros(macros: Record<string, MacroDef>): Record<string, GuardedMacro> {
	const out: Record<string, GuardedMacro> = {};
	for (const [name, macro] of Object.entries(macros)) {
		out[name] = { def: macro.def, args: macro.args ?? 0, expand: false, captureSelection: true };
	}
	return out;
}

/** identifies a dictionary by what it DEFINES, so a keystroke that leaves the definitions alone
 *  does not re-typeset every equation on screen */
export function macroKey(macros: Record<string, GuardedMacro>): string {
	return Object.keys(macros)
		.sort()
		.map((name) => `${name}/${macros[name].args}/${macros[name].def}`)
		.join('\u0000');
}

let currentKey = '';

/** publishes the dictionary; true when it actually changed, which is when renders are stale */
export function setMathMacros(macros: Record<string, MacroDef>): boolean {
	const guarded = guardMacros(macros);
	const key = macroKey(guarded);
	if (key === currentKey) return false;
	currentKey = key;
	mathMacros.current = guarded;
	return true;
}
