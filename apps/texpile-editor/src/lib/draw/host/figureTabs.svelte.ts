import { untrack } from 'svelte';
import { collabHost } from '$lib/collab/hostStore.svelte';
import { activeFigure, activeFilePath } from '$lib/workspace/workspaceStore';
import { editorGroups } from '$lib/workspace/groups/editorGroups.svelte';
import { tabKey, type Tab } from '$lib/workspace/tabs.svelte';
import {
	CLOSE_FIGURE,
	OPEN_FIGURE,
	SHOW_FIGURE,
	type FigureDetail,
	type OpenFigureDetail
} from '$lib/languages/latex/visual/extensions/tikzPicture/openFigure';
import { figureFor, pictureOfCard } from './anchor/figureAnchors';
import { openFigure } from './anchor/openFigures.svelte';

type FigureTabsHost = { openTab: (path: string, figure: string) => void; closeTab: (tab: Tab) => void; reread: () => void };

function figureTab(figure: string): Tab | null {
	const path = openFigure(figure)?.path;
	return path ? { path, figure } : null;
}

/** focuses the editor group that has the tab, else opens it in the focused one */
function showFigure(host: FigureTabsHost, tab: Tab): void {
	const key = tabKey(tab);
	const group = editorGroups.list.find((g) => editorGroups.tabsOf(g.id).some((t) => tabKey(t) === key));
	if (group) editorGroups.focus(group.id, tab);
	else host.openTab(tab.path, tab.figure!);
}

/** a picture double-clicked in the paper opens in a figure tab beside it, held by its place in the file's text, and the
 *  paper reads what the figure wrote once it is shown again; called while the workspace mounts */
export function followFigureTabs(host: FigureTabsHost): void {
	$effect(() => {
		function open(e: Event) {
			const path = activeFilePath.current;
			const ytext = path && collabHost.collabFor(path)?.ytext;
			if (!path || !ytext) return;
			const text = ytext.toString();
			const picture = pictureOfCard(text, (e as CustomEvent<OpenFigureDetail>).detail);
			if (picture) host.openTab(path, figureFor(path, ytext, text, picture.from));
		}
		function close(e: Event) {
			const tab = figureTab((e as CustomEvent<FigureDetail>).detail.figure);
			if (tab) host.closeTab(tab);
		}
		function show(e: Event) {
			const tab = figureTab((e as CustomEvent<FigureDetail>).detail.figure);
			if (tab) showFigure(host, tab);
		}
		window.addEventListener(OPEN_FIGURE, open);
		window.addEventListener(CLOSE_FIGURE, close);
		window.addEventListener(SHOW_FIGURE, show);
		return () => {
			window.removeEventListener(OPEN_FIGURE, open);
			window.removeEventListener(CLOSE_FIGURE, close);
			window.removeEventListener(SHOW_FIGURE, show);
		};
	});
	let shown = false;
	$effect(() => {
		const now = activeFigure.current !== null;
		if (shown && !now) untrack(host.reread);
		shown = now;
	});
}
