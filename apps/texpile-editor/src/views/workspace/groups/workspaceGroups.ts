// The workspace's side of the editor groups: what focus moving to a group does to the open document
import type { GroupHost, GroupOwnDoc } from '$lib/workspace/groups/editorGroups.svelte';
import { visualDocCache } from '$lib/workspace/visualDocCache';
import { noParse, parseOf } from '$lib/editor/visual/parseOrigins';
import type { EditorPaneProps } from '../editorPaneProps';
import type { Tab } from '$lib/workspace/tabs.svelte';
import { activeCompare, activeFilePath } from '$lib/workspace/workspaceStore';
import { editorViewStore } from '$lib/stores/editorStore';
import { saveVisualPosition } from '$lib/workspace/visualPositions';
import type { WorkspaceDoc } from '../workspaceDoc.svelte';
import type { WorkspaceEditFlow } from '../workspaceEditFlow.svelte';

type GroupDeps = { wsdoc: WorkspaceDoc; editFlow: () => WorkspaceEditFlow };

/**
 * The file opener takes the edited document from the cache when its text still matches. The entry may
 * be another group's copy of the file, which would swap the editor to it and lose its caret; a group
 * coming back opens on its own
 */
function seatOwnDoc(path: string, own: GroupOwnDoc): void {
	const frozen = own.frozen as EditorPaneProps;
	if (frozen.loadedPath !== path || !frozen.docMeta) return;
	visualDocCache.set(path, frozen.texSource, {
		doc: own.doc,
		preamble: frozen.docMeta.preamble,
		postamble: frozen.docMeta.postamble,
		hadDocumentEnv: frozen.docMeta.hadDocumentEnv,
		warnings: [],
		map: frozen.sourceMap,
		origins: parseOf(own.doc) ?? noParse()
	});
}

export function groupHostOf(d: GroupDeps): Omit<GroupHost, 'capture'> {
	function activeTab(): Tab | null {
		const path = activeFilePath.current;
		return path ? { path, compare: activeCompare.current ?? undefined } : null;
	}
	return {
		activeTab,
		mode: () => d.wsdoc.modes.mode,
		enter(tab, mode, own) {
			const { modes } = d.wsdoc;
			const was = activeTab();
			const same = !!tab && was?.path === tab.path && (was.compare?.hash ?? null) === (tab.compare?.hash ?? null);
			if (tab && own && !same && mode === 'visual' && !tab.compare) seatOwnDoc(tab.path, own);
			// each group keeps the mode it was in; set before the tab, so a new file opens in it
			const modeChanged = modes.mode !== mode;
			modes.mode = mode;
			if (tab) d.editFlow().activateTab(tab);
			else {
				activeCompare.current = null;
				activeFilePath.current = null;
			}
			// the same file, now visual: what the other group typed in source has to be parsed in
			if (same && modeChanged && mode === 'visual') d.wsdoc.rebuildVisualFromSource();
		},
		beforeSplit() {
			const { doc, modes } = d.wsdoc;
			const view = editorViewStore.current;
			if (modes.mode === 'visual' && view && doc.path) saveVisualPosition(view, doc.path, doc.texSource, doc.sourceMap);
			// the new group's editor is built from visualDoc, which a visual edit does not move on
			if (doc.lastDoc && doc.lastDocSource === doc.texSource) doc.visualDoc = doc.lastDoc;
		}
	};
}
