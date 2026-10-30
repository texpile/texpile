import { untrack } from 'svelte';
import { activeFigure, activeFilePath } from '$lib/workspace/workspaceStore';
import { OPEN_FIGURE, type OpenFigureDetail } from '$lib/languages/latex/visual/extensions/tikzPicture/openFigure';

/** a picture double-clicked in the paper opens in a figure tab beside it, and the paper reads what the figure wrote
 *  once it is shown again; called while the workspace mounts */
export function followFigureTabs(host: { openTab: (path: string, picture: number) => void; reread: () => void }): void {
	$effect(() => {
		function open(e: Event) {
			const path = activeFilePath.current;
			if (path) host.openTab(path, (e as CustomEvent<OpenFigureDetail>).detail.picture);
		}
		window.addEventListener(OPEN_FIGURE, open);
		return () => window.removeEventListener(OPEN_FIGURE, open);
	});
	let shown = false;
	$effect(() => {
		const now = activeFigure.current !== null;
		if (shown && !now) untrack(host.reread);
		shown = now;
	});
}
