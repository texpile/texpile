// A parked group's pane: drawn from what it showed when focus left it, its own tabs, and nothing that
// would act on the focused group's editor. Anything clicked on its tab strip brings it into focus first
import { editorGroups, type EditorGroup } from '$lib/workspace/groups/editorGroups.svelte';
import { tabKey } from '$lib/workspace/tabs.svelte';
import type { DraggedTab } from '$lib/workspace/groups/tabDrag';
import type { EditorPaneProps } from '../editorPaneProps';
import { overlayProps } from './overlayProps';

function nothing(): void {}

/** every handler goes quiet: each acts on the focused group's document */
function quiet(props: EditorPaneProps): EditorPaneProps {
	const out: Record<string, unknown> = { ...props };
	for (const [key, value] of Object.entries(out)) if (typeof value === 'function' && key !== 'fileUrl') out[key] = nothing;
	return out as EditorPaneProps;
}

export type ParkedActions = { split: () => void; drop: (drop: DraggedTab, index: number) => void };

export function parkedPaneProps(g: EditorGroup, live: EditorPaneProps, act: ParkedActions): EditorPaneProps {
	// restored with the folder and not opened yet: nothing of its own to show
	const frozen = quiet((g.frozen ?? { ...live, loadedPath: null, visualDoc: null }) as EditorPaneProps);
	// one file in both groups: the source editor takes the live text, the visual one follows the focused editor
	function same(): boolean {
		return !!frozen.loadedPath && frozen.loadedPath === live.loadedPath;
	}
	function focused<A extends unknown[]>(run: (...args: A) => void) {
		return (...args: A) => editorGroups.focusThen(g.id, () => run(...args));
	}
	return overlayProps<EditorPaneProps>(frozen, {
		parked: true,
		groupId: g.id,
		openTabs: g.tabs?.list ?? frozen.openTabs,
		activeTabKey: g.active ? tabKey(g.active) : null,
		previewTab: g.tabs?.preview ?? null,
		// straight onto the tab: focusing first would open the group's last one on the way
		onActivateTab: (tab) => editorGroups.focus(g.id, tab),
		onCloseTab: focused(live.onCloseTab),
		onKeepTab: focused(live.onKeepTab),
		onTabMenu: live.onTabMenu && focused(live.onTabMenu),
		onSplit: focused(act.split),
		onDropTab: act.drop,
		get texSource() {
			return same() ? live.texSource : frozen.texSource;
		},
		get rawContent() {
			return same() ? live.rawContent : frozen.rawContent;
		},
		commentRanges: [],
		commentThreads: [],
		selectedComment: null,
		commentsCtl: undefined,
		sourceGotoLine: undefined
	});
}
