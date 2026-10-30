// Typst source read by Typst's own parser, outside an editor; the parser carries its wasm, so it loads on first use
import type { Tree } from '@lezer/common';

type TreeParser = { parse(text: string): Tree };

let parser: TreeParser | null = null;
let loading: Promise<TreeParser> | null = null;
const recent = new Map<string, Tree>();
const KEPT = 16;

export function loadTypstParser(): Promise<TreeParser> {
	// a failed load is tried again on the next call
	loading ??= import('texpile-typst-syntax-wasm')
		.then((wasm) => (parser = new wasm.TypstParser()))
		.catch((error: unknown) => {
			loading = null;
			throw error;
		});
	return loading;
}

function parseWith(loaded: TreeParser, text: string): Tree {
	const known = recent.get(text);
	if (known) return known;
	const tree = loaded.parse(text);
	recent.set(text, tree);
	if (recent.size > KEPT) recent.delete(recent.keys().next().value!);
	return tree;
}

export async function typstTreeOf(text: string): Promise<Tree> {
	return parseWith(await loadTypstParser(), text);
}

/** null until the parser has loaded; a Typst editor loads it as it opens */
export function typstTreeNow(text: string): Tree | null {
	if (parser) return parseWith(parser, text);
	loadTypstParser().catch(() => undefined);
	return null;
}
