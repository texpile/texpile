// The workspace's side of the editor groups: what focus moving to a group does to the open document
import type { GroupHost, GroupOwnDoc } from '$lib/workspace/groups/editorGroups.svelte';
import { visualDocCache } from '$lib/workspace/visualDocCache';
import { noParse, parseOf } from '$lib/editor/visual/parseOrigins';
import type { EditorPaneProps } from '../editorPaneProps';
import type { Tab } from '$lib/workspace/tabs.svelte';
import { activeCompare, activeFilePath } from '$lib/workspace/workspaceStore';
import { editorViewStore } from '$lib/stores/editorStore';
import { saveVisualPosition, restoreVisualPosition } from '$lib/workspace/visualPositions';
import type { WorkspaceDoc } from '../workspaceDoc.svelte';
import type { WorkspaceEditFlow } from '../workspaceEditFlow.svelte';
import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';
import { fileKind, formatOf, hasVisualMode } from '$lib/workspace/documentBuffer.svelte';

type GroupDeps = { wsdoc: WorkspaceDoc; editFlow: () => WorkspaceEditFlow; provider: WorkspaceProvider };

/**
 * The file opener takes the edited document from the cache when its text still matches. The entry may
 * be another group's copy of the file, which would swap the editor to it and lose its caret; a group
 * coming back opens on its own
 */
function seatOwnDoc(path: string, own: GroupOwnDoc): void {
	const shown = own.shown as EditorPaneProps;
	if (shown.loadedPath !== path || !shown.docMeta) return;
	visualDocCache.set(path, shown.texSource, {
		doc: own.doc,
		preamble: shown.docMeta.preamble,
		postamble: shown.docMeta.postamble,
		hadDocumentEnv: shown.docMeta.hadDocumentEnv,
		warnings: [],
		map: shown.sourceMap,
		origins: parseOf(own.doc) ?? noParse()
	});
}

/**
 * Focus back on a slot showing the open file: its editor followed the other one and has the newest document.
 * The workspace's visualDoc is the last parse, which a visual edit does not move on, and handed to the editor
 * it would take it back to that, and the next edit would save it over what the other slot typed
 */
export function adoptOwnDoc(wsdoc: WorkspaceDoc, own: GroupOwnDoc): void {
	const { doc } = wsdoc;
	const shown = own.shown as EditorPaneProps;
	if (shown.texSource !== doc.texSource) return wsdoc.rebuildVisualFromSource();
	doc.visualDoc = own.doc;
	// the map that goes with it: a caret read through another document's map lands somewhere else
	if (shown.sourceMap) doc.sourceMap = shown.sourceMap;
	doc.lastDoc = own.doc;
	doc.lastDocSource = doc.texSource;
}

export function groupHostOf(d: GroupDeps): Omit<GroupHost, 'capture'> {
	function activeTab(): Tab | null {
		const path = activeFilePath.current;
		return path ? { path, compare: activeCompare.current ?? undefined } : null;
	}
	return {
		activeTab,
		mode: () => d.wsdoc.modes.mode,
		async parseFile(path, text) {
			const kind = fileKind(path);
			if (!hasVisualMode(kind)) return null;
			const { parsed } = await d.wsdoc.parser.parse(text, formatOf(kind), false);
			if (!parsed) return null;
			const { doc, map, preamble, postamble, hadDocumentEnv } = parsed;
			return { doc, map, meta: { preamble, postamble, hadDocumentEnv } };
		},
		setMode(mode) {
			const { modes } = d.wsdoc;
			modes.mode = mode;
		},
		enter(tab, mode, own) {
			const { modes } = d.wsdoc;
			// the caret of the slot being left, while the workspace still runs in its mode: the switch below takes the
			// incoming slot's, and the file-switch hook would then read the wrong editor
			d.editFlow().rememberVisualCaret();
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
			// the same file, now visual: the slot's own document has followed every edit, wherever it was typed, and
			// keeps its caret and history; a parse is only for a slot with none, or one that fell behind
			if (same && mode === 'visual' && own) adoptOwnDoc(d.wsdoc, own);
			else if (same && modeChanged && mode === 'visual') d.wsdoc.rebuildVisualFromSource();
		},
		beforeSplit() {
			const { doc, modes } = d.wsdoc;
			const view = editorViewStore.current;
			if (modes.mode === 'visual' && view && doc.path) saveVisualPosition(view, doc.path, doc.texSource, doc.sourceMap);
			// the new group's editor is built from visualDoc, which a visual edit does not move on
			if (doc.lastDoc && doc.lastDocSource === doc.texSource) doc.visualDoc = doc.lastDoc;
		},
		placeSplitCaret() {
			const { doc, modes } = d.wsdoc;
			const view = editorViewStore.current;
			if (modes.mode === 'visual' && view && doc.path) restoreVisualPosition(view, doc.path, doc.texSource, doc.sourceMap);
		}
	};
}
