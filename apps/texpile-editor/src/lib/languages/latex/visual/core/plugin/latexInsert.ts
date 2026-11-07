import type { Node } from 'prosemirror-model';
import type { Command } from 'prosemirror-state';
import type { InsertArgument, InsertItem } from '$lib/editor/visual/insert/insertItem';
import { renameLoneEnvironment } from '$lib/editor/visual/insert/loneEnvironmentTurns';
import { useNameOf } from '$lib/languages/latex/knowledge/fileIds';
import type { StackedCommand, StackedEnvironment } from '$lib/languages/latex/knowledge/stackedEntries';
import type { Argument } from '$lib/languages/latex/knowledge/types';

export type LatexInsertContext = {
	environment(name: string): StackedEnvironment | undefined;
	command(name: string): StackedCommand | undefined;
	environments(): StackedEnvironment[];
	hint(entry: { from: string }): string | undefined;
};

export type LatexInsertOffer = InsertItem & { covers?: readonly string[] };

export type LatexArgumentContext = {
	environmentArgs(name: string): readonly Argument[];
	commandArgs(name: string): readonly Argument[];
};

export type LatexArguments = (node: Node, pos: number, ctx: LatexArgumentContext) => InsertArgument[];

export function hintOf(entry: { from: string }): string | undefined {
	const name = useNameOf(entry.from);
	if (name === 'latex-document') return undefined;
	return name.replace(/^class-/, '');
}

export const MANDATORY = /^[mr]/;

export function argumentSlots(args: readonly Argument[] | null | undefined): string {
	return (args ?? []).map((a) => (MANDATORY.test(a.kind) ? (a.kind[0] === 'r' ? `${a.kind[1]}${a.kind[2]}` : '{}') : '')).join('');
}

const LEADING_OPTIONAL = /^\s*\[[^\]]*\]/;

export function renameEnvironment(name: string, args: string, keepsTitle = false): Command {
	return renameLoneEnvironment('environment', (env) => {
		const title = keepsTitle ? LEADING_OPTIONAL.exec(String(env.attrs.args ?? ''))?.[0].trim() : undefined;
		return { ...env.attrs, name, args: (title ?? '') + args };
	});
}
