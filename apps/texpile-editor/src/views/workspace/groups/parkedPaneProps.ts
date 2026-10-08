// A parked slot's pane: its own tabs, its file as it is now (fileFeed) with that file's comments, and
// nothing that would act on the focused slot's editor. Anything clicked on it brings it into focus first
import { editorGroups, type EditorGroup } from '$lib/workspace/groups/editorGroups.svelte';
import { fileNow } from '$lib/workspace/groups/fileFeed.svelte';
import { tabKey } from '$lib/workspace/tabs.svelte';
import type { DraggedTab } from '$lib/workspace/groups/slotDrag.svelte';
import type { CommentRange } from '$lib/editor/visual/extensions/comments';
import type { CommentThread } from '$lib/comments/log';
import { relativeTo } from '$lib/comments/store.svelte';
import { placeThreads } from '$lib/workspace/threadPlacement';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import type { EditorPaneProps } from '../editorPaneProps';
import { overlayProps } from './overlayProps';

function nothing(): void {}

/** the threads on a file that is not the focused one; what is measured on it is kept nowhere */
function threadsOn(all: CommentThread[], path: string): CommentThread[] {
	const root = workspaceRoot.current;
	const file = root ? relativeTo(root, path) : null;
	return file ? all.filter((t) => t.file === file) : [];
}

/** every handler goes quiet: each acts on the focused slot's document */
function quiet(props: EditorPaneProps): EditorPaneProps {
	const out: Record<string, unknown> = { ...props };
	for (const [key, value] of Object.entries(out)) if (typeof value === 'function' && key !== 'fileUrl') out[key] = nothing;
	return out as EditorPaneProps;
}

export type ParkedActions = {
	/** visual or source, switched in place */
	setMode: (mode: 'visual' | 'source') => void;
	open: (paths: string[], index: number) => void;
	emptyNote: string | undefined;
	drop: (drop: DraggedTab, index: number) => void;
};

export function parkedPaneProps(g: EditorGroup, live: EditorPaneProps, act: ParkedActions): EditorPaneProps {
	// restored with the folder and not opened yet: nothing of its own to show
	const frozen = quiet((g.frozen ?? { ...live, loadedPath: null, visualDoc: null }) as EditorPaneProps);
	const path = frozen.loadedPath;
	// the visual editor shows the feed's document, so the text and map that go with it are that document's
	const visual = frozen.viewMode === 'visual';
	function focused<A extends unknown[]>(run: (...args: A) => void) {
		return (...args: A) => editorGroups.focusThen(g.id, () => run(...args));
	}
	let placed: { text: string; threads: CommentThread[]; ranges: CommentRange[] } | null = null;
	const pane: EditorPaneProps = overlayProps<EditorPaneProps>(frozen, {
		parked: true,
		groupId: g.id,
		sourceScrollAnchor: null,
		openTabs: g.tabs?.list ?? frozen.openTabs,
		activeTabKey: g.active ? tabKey(g.active) : null,
		previewTab: g.tabs?.preview ?? null,
		// straight onto the tab: focusing first would open the slot's last one on the way
		onActivateTab: (tab) => editorGroups.focus(g.id, tab),
		onCloseTab: focused(live.onCloseTab),
		onKeepTab: focused(live.onKeepTab),
		onTabMenu: live.onTabMenu && focused(live.onTabMenu),
		// a slot whose file went still has its other tabs: one of them, not a drop, is what it waits for
		get emptyNote() {
			return g.tabs?.list.length ? undefined : act.emptyNote;
		},
		onDropTab: act.drop,
		onDropFiles: act.open,
		get texSource() {
			const now = path ? fileNow(path) : undefined;
			if (!now) return frozen.texSource;
			return visual ? (now.visual?.text ?? frozen.texSource) : now.text;
		},
		get rawContent() {
			return (path && fileNow(path)?.text) ?? frozen.rawContent;
		},
		get sourceMap() {
			return (visual && path && fileNow(path)?.visual?.map) || frozen.sourceMap;
		},
		get docMeta() {
			return (visual && path && fileNow(path)?.visual?.meta) || frozen.docMeta;
		},
		get commentsCtl() {
			return live.commentsCtl;
		},
		get commentThreads() {
			const ctl = live.commentsCtl;
			return ctl && path ? threadsOn(ctl.threads, path) : [];
		},
		// placed again only when the text or the threads change: a new list re-places every mark
		get commentRanges() {
			const ctl = live.commentsCtl;
			if (!ctl || !path) return [];
			const text = pane.kind === 'tex' || pane.kind === 'md' || pane.kind === 'typ' ? pane.texSource : pane.rawContent;
			const threads = ctl.threads;
			if (placed?.text !== text || placed.threads !== threads) {
				const ranges = placeThreads(threadsOn(threads, path), text, () => null, new Map(), new Map()).ranges;
				placed = { text, threads, ranges };
			}
			return placed.ranges;
		},
		get selectedComment() {
			return live.selectedComment;
		},
		onSelectComment: live.onSelectComment && focused(live.onSelectComment),
		onSetViewMode: act.setMode,
		sourceGotoLine: undefined
	});
	return pane;
}
