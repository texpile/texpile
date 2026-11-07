// the optional arguments of the nodes around the caret that Insert offers, innermost first
import type { EditorState } from 'prosemirror-state';
import type { CaretArgument, InsertArgument } from '$lib/editor/visual/insert/insertItem';
import type { LoadedFile } from '$lib/languages/latex/knowledge/loadedFiles';
import { stackedCommands, stackedEnvironments } from '$lib/languages/latex/knowledge/stackedEntries';
import { latexPlugins } from '../../latexPlugins';
import { optionalArgumentOffers } from './argumentGroups';
import type { LatexArgumentContext } from './latexInsert';

function contextOf(loaded: LoadedFile[] | null): LatexArgumentContext {
	return {
		environmentArgs: (name) => (loaded ? stackedEnvironments(loaded).get(name)?.args : null) ?? [],
		commandArgs: (name) => (loaded ? stackedCommands(loaded).get(name)?.args : null) ?? []
	};
}

export function latexArgumentsAt(state: EditorState, loaded: LoadedFile[] | null): CaretArgument[] {
	const ctx = contextOf(loaded);
	const { $from } = state.selection;
	const out: CaretArgument[] = [];
	for (let depth = $from.depth; depth > 0; depth--) {
		const node = $from.node(depth);
		const pos = $from.before(depth);
		const offers: InsertArgument[] = latexPlugins.flatMap((plugin) => plugin.arguments?.(node, pos, ctx) ?? []);
		// the core's environment keeps what follows \begin{name} as written
		if (node.type.name === 'environment') {
			const name = String(node.attrs.name);
			offers.push(...optionalArgumentOffers(ctx.environmentArgs(name), String(node.attrs.args ?? ''), 'args', `env:${name}`));
		}
		out.push(...offers.map((offer) => ({ ...offer, id: `${depth}:${offer.id}`, run: (value: string) => offer.run(value, pos) })));
	}
	return out;
}
