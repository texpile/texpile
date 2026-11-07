// what the open Typst file offers to insert; markdown's block handle keeps a list of its own
import type { BlockInsertItem } from '$lib/editor/visual/insert/insertItem';
import { insertArguments, insertItems, insertSourceOf, styleEnvironment } from '$lib/editor/visual/insert/insertItems.svelte';
import { typstPackageCache } from '$lib/languages/typst/visual/core/scope/typstProject';
import { typstArgumentsAt } from '$lib/languages/typst/visual/core/plugin/typstInsertArguments';
import { typstScopeNow } from '$lib/languages/typst/visual/core/scope/fileScopeNow.svelte';
import { typstInsertItems, typstStyleEnvironment } from '$lib/languages/typst/visual/core/plugin/typstInsertList';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';

let asked = 0;

/** a list on its way for a file no longer open stays out */
export function dropPendingInserts(): void {
	asked++;
}

function sourceOf(item: BlockInsertItem): string | null {
	const node = item.make(typSchema);
	return node && serializeToTypst(typSchema.nodes.doc.create(null, node)).trim();
}

export function offerOtherInserts(kind: 'md' | 'typ', source: string): void {
	const ask = ++asked;
	insertArguments.current = () => [];
	if (kind === 'md') {
		insertItems.current = [];
		styleEnvironment.current = () => false;
		insertSourceOf.current = null;
		return;
	}
	void typstInsertItems(source, typstPackageCache).then((items) => {
		if (ask !== asked) return;
		insertItems.current = items;
		styleEnvironment.current = typstStyleEnvironment(items);
		insertArguments.current = (state) => typstArgumentsAt(state, typstScopeNow.current);
		insertSourceOf.current = sourceOf;
	});
}
