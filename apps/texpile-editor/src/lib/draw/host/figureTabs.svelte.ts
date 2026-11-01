import { untrack } from 'svelte';
import { collabHost } from '$lib/collab/hostStore.svelte';
import { activeFigure, activeFilePath } from '$lib/workspace/workspaceStore';
import { editorGroups } from '$lib/workspace/groups/editorGroups.svelte';
import { samePath } from '$lib/workspace/fileSystem';
import { tabKey, type Tab } from '$lib/workspace/tabs.svelte';
import {
	CLOSE_FIGURE,
	OPEN_FIGURE,
	OPEN_FIGURE_AT,
	SHOW_FIGURE,
	SHOW_FIGURE_SOURCE,
	type FigureDetail,
	type FigureSourceDetail,
	type OpenFigureAtDetail,
	type OpenFigureDetail
} from '$lib/draw/host/card/figureEvents';
import { figureFor, pictureOfCard } from './anchor/figureAnchors';
import { openFigure } from './anchor/openFigures.svelte';
import { stopEngineWhenIdle } from './engine/engineIdle';

type FigureTabsHost = {
	openTab: (path: string, figure: string) => void;
	closeTab: (tab: Tab) => void;
	showFile: (path: string) => void;
	showLine: (path: string, line: number) => void;
	reread: () => void;
};

function figureTab(figure: string): Tab | null {
	const path = openFigure(figure)?.path;
	return path ? { path, figure } : null;
}

function showFigure(host: FigureTabsHost, tab: Tab): void {
	const key = tabKey(tab);
	const group = editorGroups.list.find((g) => editorGroups.tabsOf(g.id).some((t) => tabKey(t) === key));
	if (group) editorGroups.focus(group.id, tab);
	else host.openTab(tab.path, tab.figure!);
}

function showSource(host: FigureTabsHost, path: string, line: number): void {
	const source = editorGroups.list.find((g) => {
		const tab = g.active;
		return (
			!editorGroups.isFocused(g) && tab && !tab.figure && !tab.compare && samePath(tab.path, path) && editorGroups.modeOf(g.id) === 'source'
		);
	});
	if (source) return editorGroups.focusThen(source.id, () => host.showLine(path, line));
	host.showFile(path);
	host.showLine(path, line);
}

export function followFigureTabs(host: FigureTabsHost): void {
	$effect(() => {
		function open(e: Event) {
			const path = activeFilePath.current;
			const ytext = path && collabHost.collabFor(path)?.ytext;
			if (!path || !ytext) return;
			const text = ytext.toString();
			const picture = pictureOfCard(path, text, (e as CustomEvent<OpenFigureDetail>).detail);
			if (picture) host.openTab(path, figureFor(path, ytext, text, picture.from));
		}
		function openAt(e: Event) {
			const { path, from } = (e as CustomEvent<OpenFigureAtDetail>).detail;
			const ytext = collabHost.collabFor(path)?.ytext;
			if (ytext) host.openTab(path, figureFor(path, ytext, ytext.toString(), from));
		}
		function close(e: Event) {
			const tab = figureTab((e as CustomEvent<FigureDetail>).detail.figure);
			if (tab) host.closeTab(tab);
		}
		function source(e: Event) {
			const { figure, line } = (e as CustomEvent<FigureSourceDetail>).detail;
			const tab = figureTab(figure);
			if (tab) showSource(host, tab.path, line);
		}
		function show(e: Event) {
			const tab = figureTab((e as CustomEvent<FigureDetail>).detail.figure);
			if (tab) showFigure(host, tab);
		}
		window.addEventListener(OPEN_FIGURE, open);
		window.addEventListener(OPEN_FIGURE_AT, openAt);
		window.addEventListener(CLOSE_FIGURE, close);
		window.addEventListener(SHOW_FIGURE, show);
		window.addEventListener(SHOW_FIGURE_SOURCE, source);
		return () => {
			window.removeEventListener(OPEN_FIGURE, open);
			window.removeEventListener(OPEN_FIGURE_AT, openAt);
			window.removeEventListener(CLOSE_FIGURE, close);
			window.removeEventListener(SHOW_FIGURE, show);
			window.removeEventListener(SHOW_FIGURE_SOURCE, source);
		};
	});
	$effect(stopEngineWhenIdle);
	let shown = false;
	$effect(() => {
		const now = activeFigure.current !== null;
		if (shown && !now) untrack(host.reread);
		shown = now;
	});
}
