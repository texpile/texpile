// A parked group's pane: drawn from what it showed when focus left it, its own tabs, and nothing that
// would act on the focused group's editor. Anything clicked on its tab strip brings it into focus first
import type { EditorGroup } from '$lib/workspace/groups/editorGroups.svelte';
import { tabKey } from '$lib/workspace/tabs.svelte';
import type { EditorPaneProps } from '../editorPaneProps';
import { overlayProps } from './overlayProps';

function nothing(): void {}

/** every handler goes quiet: each acts on the focused group's document */
function quiet(props: EditorPaneProps): EditorPaneProps {
	const out: Record<string, unknown> = { ...props };
	for (const [key, value] of Object.entries(out)) if (typeof value === 'function' && key !== 'fileUrl') out[key] = nothing;
	return out as EditorPaneProps;
}

export function parkedPaneProps(g: EditorGroup, live: EditorPaneProps, focus: () => void, split: () => void): EditorPaneProps {
	const frozen = quiet((g.frozen ?? { ...live }) as EditorPaneProps);
	// one file in both groups: the source editor takes the live text, the visual one follows the focused editor
	function same(): boolean {
		return !!frozen.loadedPath && frozen.loadedPath === live.loadedPath;
	}
	function focused<A extends unknown[]>(run: (...args: A) => void) {
		return (...args: A) => {
			focus();
			run(...args);
		};
	}
	return overlayProps<EditorPaneProps>(frozen, {
		parked: true,
		openTabs: g.tabs?.list ?? frozen.openTabs,
		activeTabKey: g.active ? tabKey(g.active) : null,
		previewTab: g.tabs?.preview ?? null,
		onActivateTab: focused(live.onActivateTab),
		onCloseTab: focused(live.onCloseTab),
		onKeepTab: focused(live.onKeepTab),
		onTabMenu: live.onTabMenu && focused(live.onTabMenu),
		onSplit: focused(split),
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
