import { insertArguments, insertItems, insertSourceOf, styleEnvironment } from '$lib/editor/visual/insert/insertItems.svelte';
import {
	documentFileIds,
	documentPackages,
	documentPackagesNow,
	type LoadedFile
} from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { latexArgumentsAt } from '$lib/languages/latex/visual/core/plugin/insertArguments';
import { latexInsertItems, latexStyleEnvironment } from '$lib/languages/latex/visual/core/plugin/insertList';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import type { BlockInsertItem } from '$lib/editor/visual/insert/insertItem';
import { dropPendingInserts } from './typstInserts';

function sourceOf(item: BlockInsertItem): string | null {
	const node = item.make(schema);
	return node && serializeToLatex(schema.nodes.doc.create(null, node)).trim();
}

let builtFrom: { definitions: string; loaded: LoadedFile[] | null } | null = null;

export function offerLatexInserts(preamble: string, definitions: string): Promise<unknown> | null {
	dropPendingInserts();
	const loaded = documentPackagesNow(preamble);
	if (!loaded || builtFrom?.loaded !== loaded || builtFrom.definitions !== definitions) {
		builtFrom = { definitions, loaded };
		insertItems.current = latexInsertItems({ loaded, direct: documentFileIds(preamble), definitions });
		styleEnvironment.current = latexStyleEnvironment(insertItems.current);
		insertArguments.current = (state) => latexArgumentsAt(state, loaded);
		insertSourceOf.current = sourceOf;
	}
	return loaded ? null : documentPackages(preamble);
}
