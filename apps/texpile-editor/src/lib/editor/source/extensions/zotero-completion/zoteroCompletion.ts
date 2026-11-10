import type { Completion } from '@codemirror/autocomplete';
import type { EditorView as CMView } from '@codemirror/view';
import { sourceCmView } from '$lib/stores/editorStore';
import { commandPalette } from '$lib/workspace/commandPalette.svelte';
import { m } from '$lib/paraglide/messages';

// last in a citation list, and typing "zot" brings it up
export function zoteroCompletion(view: CMView | undefined): Completion | null {
	const actions = commandPalette.actions;
	if (!view || view !== sourceCmView.current || !actions?.insertZoteroCitation || !actions.canZoteroCite?.()) return null;
	return {
		label: m.zotero_insert_citation(),
		type: 'text',
		boost: -99,
		apply: (target, _completion, from, to) => {
			target.dispatch({ changes: { from, to }, selection: { anchor: from } });
			actions.insertZoteroCitation?.();
		}
	};
}
