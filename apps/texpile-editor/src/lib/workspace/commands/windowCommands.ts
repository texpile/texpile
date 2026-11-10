import { focusedTab, showTab } from '$lib/workspace/workspaceStore';
import { tabs, tabKey } from '$lib/workspace/tabs.svelte';
import { nativeBridge } from '$lib/workspace/fileSystem';
import { pdfFindFor } from '$lib/preview/pdfViewFind';
import { isMac } from '$lib/platform';
import { keyTarget } from '$lib/keybindings/dispatch/keyDispatcher';
import type { CommandImpl } from '$lib/keybindings/commands/commandRegistry';
import { commandPalette } from '$lib/workspace/commandPalette.svelte';
import { editorGroups } from '../groups/editorGroups.svelte';
import { uiZoomIn, uiZoomOut, uiZoomReset, type ShortcutDeps } from '../shortcuts';
import { setThemeName, themeName } from '$lib/theme';

function cycleTab(step: 1 | -1): void {
	// by tab key, so a file and a comparison of it are two stops rather than one
	const focused = focusedTab();
	const next = tabs.cycle(focused && tabKey(focused), step);
	if (next) showTab(next);
}

export function windowCommands(deps: ShortcutDeps): CommandImpl[] {
	return [
		{
			id: 'tab.close',
			// the focused tab, which may be a comparison rather than the file itself; with no tab left, the window, as
			// Cmd+W does in every other Mac app
			run: () => {
				const tab = focusedTab();
				if (tab) deps.closeTab(tab);
				else if (isMac) void nativeBridge()?.windowClose?.();
			}
		},
		{ id: 'tab.reopen', run: () => deps.reopenTab() },
		{ id: 'tab.next', run: () => cycleTab(1) },
		{ id: 'tab.previous', run: () => cycleTab(-1) },
		...[0, 1, 2, 3].map((at): CommandImpl => ({ id: `view.focusEditor${at + 1}`, run: () => editorGroups.focusAt(at) })),
		{ id: 'edit.undo', run: () => deps.stepDocumentHistory('undo') },
		{ id: 'edit.redo', run: () => deps.stepDocumentHistory('redo') },
		{
			id: 'view.findInFiles',
			enabled: () => !!commandPalette.actions?.canSearch(),
			// the key toggles the panel, as it always has; the palette opens it
			run: (args) =>
				(args as { toggle?: boolean } | undefined)?.toggle ? deps.toggleGlobalSearch() : commandPalette.actions?.openGlobalSearch()
		},
		// a .pdf tab or a PDF view with the focus: the editors bind Ctrl+F themselves, and off macOS no native menu carries it
		{ id: 'pdf.find', enabled: () => !!pdfFindFor(keyTarget()), run: () => pdfFindFor(keyTarget())?.() },
		{ id: 'view.defaultTheme', enabled: () => themeName.current !== 'theme', run: () => setThemeName('theme') },
		{ id: 'view.zoomIn', run: uiZoomIn },
		{ id: 'view.zoomOut', run: uiZoomOut },
		{ id: 'view.zoomReset', run: uiZoomReset }
	];
}
