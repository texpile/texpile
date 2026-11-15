import { scmHandlers } from '$lib/workspace/scm/actions/scmHandlers.svelte';
import { commandPalette, type PaletteActions } from '$lib/workspace/commandPalette.svelte';
import { COLOR_VISION_MODES, colorVision } from '$lib/preview/colorVision/colorVision';
import type { CommandImpl } from '$lib/keybindings/commands/commandRegistry';
import { m } from '$lib/paraglide/messages';

export function viewCommands(a: PaletteActions): CommandImpl[] {
	function git(): boolean {
		return a.canGit();
	}
	return [
		{ id: 'view.visual', enabled: () => a.hasFile() && a.getViewMode() !== 'visual', run: () => a.setViewMode('visual') },
		{ id: 'view.source', enabled: () => a.hasFile() && a.getViewMode() !== 'source', run: () => a.setViewMode('source') },
		{ id: 'view.diff', enabled: () => a.hasFile() && a.getViewMode() !== 'diff' && git(), run: () => a.setViewMode('diff') },
		{
			id: 'view.sidebar',
			enabled: () => a.hasSidebar(),
			title: () => (a.sidebarOpen() ? m.palette_hide_sidebar() : m.palette_show_sidebar()),
			run: () => a.toggleSidebar()
		},
		{
			id: 'view.bottomPanel',
			enabled: () => a.terminalAvailable(),
			title: () => (a.bottomPanelOpen() ? m.palette_hide_bottom_panel() : m.palette_show_bottom_panel()),
			run: () => a.toggleBottomPanel()
		},
		{
			id: 'view.agent',
			enabled: () => a.agentTabOffered(),
			title: () => (a.agentTabOpen() ? m.palette_hide_agent() : m.palette_show_agent()),
			run: () => a.toggleAgentTab()
		},
		...COLOR_VISION_MODES.map((mode): CommandImpl => ({
			id: `view.colorVision.${mode}`,
			enabled: () => mode !== colorVision.current,
			run: () => {
				colorVision.current = mode;
			}
		})),
		{ id: 'view.sourceControl', enabled: () => a.hasSidebar() && git(), run: () => a.openSourceControl() },
		// looks at the remote without taking anything in; Sync is what takes it in
		{ id: 'view.checkForNew', enabled: () => git() && !!scmHandlers.current?.hasUpstream(), run: () => scmHandlers.current?.checkForNew() },
		// the one way to another branch: not in the panel, where a writer would meet it without needing it, but here for
		// whoever landed on another branch and wants to go back
		{
			id: 'view.switchBranch',
			enabled: () => git() && !!scmHandlers.current?.canSwitchBranch(),
			run: () => commandPalette.show('branches')
		},
		{
			id: 'view.completeMerge',
			enabled: () => git() && !!scmHandlers.current?.canFinishMerge(),
			run: () => scmHandlers.current?.finishMerge()
		},
		{ id: 'view.abortMerge', enabled: () => git() && !!scmHandlers.current?.canFinishMerge(), run: () => scmHandlers.current?.abortMerge() }
	];
}
