// what a LaTeX plugin is asked when the insert list is built, and what it offers
import type { Node } from 'prosemirror-model';
import type { Command } from 'prosemirror-state';
import type { InsertArgument, InsertItem } from '$lib/editor/visual/insert/insertItem';
import { renameLoneEnvironment } from '$lib/editor/visual/insert/loneEnvironmentTurns';
import { useNameOf } from '$lib/languages/latex/knowledge/fileIds';
import type { StackedCommand, StackedEnvironment } from '$lib/languages/latex/knowledge/stackedEntries';
import type { Argument } from '$lib/languages/latex/knowledge/types';

export type LatexInsertContext = {
	/** what the loaded files say of an environment they define and offer */
	environment(name: string): StackedEnvironment | undefined;
	command(name: string): StackedCommand | undefined;
	/** every environment the loaded files define and offer */
	environments(): StackedEnvironment[];
	/** the name the package or class an entry comes from is loaded by: beamer, amsmath; none for the kernel */
	hint(entry: { from: string }): string | undefined;
};

/** covers: the environments it inserts, and its commands written with their backslash, which the core leaves out of its
 *  own part */
export type LatexInsertOffer = InsertItem & { covers?: readonly string[] };

export type LatexArgumentContext = {
	/** the arguments the loaded files give an environment or a command */
	environmentArgs(name: string): readonly Argument[];
	commandArgs(name: string): readonly Argument[];
};

export type LatexArguments = (node: Node, pos: number, ctx: LatexArgumentContext) => InsertArgument[];

/** the name a file is loaded by, as a hint beside what it gives */
export function hintOf(entry: { from: string }): string | undefined {
	const name = useNameOf(entry.from);
	if (name === 'latex-document') return undefined;
	return name.replace(/^class-/, '');
}

export const MANDATORY = /^[mr]/;

/** `{}` for each mandatory argument, which the environment's fields then fill */
export function argumentSlots(args: readonly Argument[] | null | undefined): string {
	return (args ?? []).map((a) => (MANDATORY.test(a.kind) ? (a.kind[0] === 'r' ? `${a.kind[1]}${a.kind[2]}` : '{}') : '')).join('');
}

/** the `[title]` an environment starts its arguments with */
const LEADING_OPTIONAL = /^\s*\[[^\]]*\]/;

/** another environment around the paragraph that stands alone in one, with the arguments of the old one dropped, bar
 *  the optional title a theorem keeps */
export function renameEnvironment(name: string, args: string, keepsTitle = false): Command {
	return renameLoneEnvironment('environment', (env) => {
		const title = keepsTitle ? LEADING_OPTIONAL.exec(String(env.attrs.args ?? ''))?.[0].trim() : undefined;
		return { ...env.attrs, name, args: (title ?? '') + args };
	});
}
