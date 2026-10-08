// a file opened in a pane that shows another in the visual editor: the last document stays up, still and
// untouchable, until the new one is parsed, and the editor swaps rather than blanking and building again
import type { Node as PMNode } from 'prosemirror-model';
import type { ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
import type { SourceMap } from '$lib/editor/visual/sourceSpans';

export type ShownVisualDoc = {
	loadedPath: string;
	visualDoc: PMNode;
	docMeta: Pick<ParsedLatexFile, 'preamble' | 'postamble' | 'hadDocumentEnv'> | null;
	texSource: string;
	sourceMap: SourceMap;
};

type PaneDoc = Omit<ShownVisualDoc, 'loadedPath' | 'visualDoc'> & {
	loadedPath: string | null;
	visualDoc: PMNode | null | undefined;
	/** the visual editor is wanted */
	pending: boolean;
};

/** a slow parse gets its loading bar after this */
const HOLD_MS = 400;

function shownOf(p: PaneDoc): ShownVisualDoc | null {
	const { loadedPath, visualDoc, docMeta, texSource, sourceMap } = p;
	return loadedPath && visualDoc ? { loadedPath, visualDoc, docMeta, texSource, sourceMap } : null;
}

/** called during component init: it runs effects */
export function heldVisualDoc(pane: () => PaneDoc) {
	let last = $state.raw<ShownVisualDoc | null>(null);
	let expired = $state(false);
	const waiting = $derived(pane().pending && !pane().visualDoc);
	$effect.pre(() => {
		const shown = shownOf(pane());
		// only straight from one document to the next: never one shown some files ago
		if (shown || !waiting) last = shown;
	});
	$effect(() => {
		if (!waiting) return;
		expired = false;
		const timer = setTimeout(() => (expired = true), HOLD_MS);
		return () => clearTimeout(timer);
	});
	return {
		/** what the visual editor shows: the pane's document, or the last one while the next is parsed */
		get current(): ShownVisualDoc | null {
			return shownOf(pane()) ?? (waiting && !expired ? last : null);
		},
		/** the pane's own document is the one shown, so the editor takes typing and draws its comments */
		get own(): boolean {
			return !!shownOf(pane());
		}
	};
}
