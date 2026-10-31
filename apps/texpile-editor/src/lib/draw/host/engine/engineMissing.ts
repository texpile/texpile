// a figure engine that is not installed: one line in the figure, and the dialog that says how to get it, once
import { askForProgram } from '$lib/modals/window/missingProgram/missingProgram.svelte';
import { m } from '$lib/paraglide/messages';

const PROGRAM_MISSING = /program missing: (\w+)/;
const asked = new Set<string>();

/** the error a picture failed with, a missing program's put in words the figure shows */
export function explainDrawError(e: unknown): unknown {
	const program = e instanceof Error ? PROGRAM_MISSING.exec(e.message)?.[1] : undefined;
	if (!program) return e;
	if (!asked.has(program)) {
		asked.add(program);
		askForProgram(program);
	}
	return new Error(program === 'tinymist' ? m.figure_needs_tinymist() : m.figure_needs_lualatex());
}
