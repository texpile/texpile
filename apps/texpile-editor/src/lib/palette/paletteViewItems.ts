import { CloudDownload, Columns2, Eye, GitBranch, GitCompare, GitMerge, PanelLeft, Search, Undo2 } from '@lucide/svelte';
import { isMac } from '$lib/platform';
import { scmHandlers } from '$lib/workspace/scm/actions/scmHandlers.svelte';
import { commandPalette } from '$lib/workspace/commandPalette.svelte';
import { combo } from '$lib/chrome/shortcutText';
import { COLOR_VISION_MODES, colorVision, colorVisionLabel } from '$lib/preview/colorVision/colorVision';
import type { PaletteActions } from '$lib/workspace/commandPalette.svelte';
import type { PaletteItem } from './paletteCommands';
import { m } from '$lib/paraglide/messages';

export function viewItems(a: PaletteActions): PaletteItem[] {
	const items: PaletteItem[] = [];
	const group = m.palette_group_view();
	const mode = a.getViewMode();
	if (a.hasFile()) {
		if (mode !== 'visual')
			items.push({
				id: 'view.visual',
				label: m.palette_show_visual(),
				group,
				keywords: 'wysiwyg rendered preview mode',
				icon: Eye,
				run: () => a.setViewMode('visual')
			});
		if (mode !== 'source')
			items.push({
				id: 'view.source',
				label: m.palette_show_source(),
				group,
				keywords: 'latex code raw mode',
				icon: Columns2,
				run: () => a.setViewMode('source')
			});
		if (mode !== 'diff' && a.canGit())
			items.push({
				id: 'view.diff',
				label: m.palette_show_diff(),
				group,
				keywords: 'git changes compare commit',
				icon: GitCompare,
				run: () => a.setViewMode('diff')
			});
	}
	if (a.hasSidebar())
		items.push({
			id: 'view.sidebar',
			label: a.sidebarOpen() ? m.palette_hide_sidebar() : m.palette_show_sidebar(),
			group,
			keywords: 'explorer files panel',
			icon: PanelLeft,
			run: () => a.toggleSidebar()
		});
	// the previews' color vision check. The simulations are found by typing (color, blind, protan...)
	// rather than listed, four rows of one feature in the browse list; the way back is listed while on
	for (const mode of COLOR_VISION_MODES) {
		if (mode === colorVision.current) continue;
		items.push({
			id: `view.colorVision.${mode}`,
			label: mode === 'none' ? m.color_vision_off() : m.color_vision_palette({ mode: colorVisionLabel(mode) }),
			group,
			keywords: 'color colour vision blind blindness deficiency accessibility simulate preview',
			icon: Eye,
			searchOnly: mode !== 'none',
			run: () => {
				colorVision.current = mode;
			}
		});
	}
	if (a.canSearch())
		items.push({
			id: 'view.findInFiles',
			label: m.wsview_find_in_files(),
			group,
			keywords: 'grep search project',
			hint: combo('F', { shift: true }),
			icon: Search,
			run: () => a.openGlobalSearch()
		});
	if (a.hasSidebar() && a.canGit())
		items.push({
			id: 'view.sourceControl',
			label: m.palette_source_control(),
			group,
			keywords: 'git scm version commit save changes history',
			hint: isMac ? '⌃⇧G' : 'Ctrl+Shift+G',
			icon: GitBranch,
			run: () => a.openSourceControl()
		});
	// looks at the remote without taking anything in; Sync is what takes it in
	if (a.canGit() && scmHandlers.current?.hasUpstream())
		items.push({
			id: 'view.checkForNew',
			label: m.vcs_fetch(),
			group,
			keywords: 'git fetch remote co-author upstream github new versions',
			icon: CloudDownload,
			run: () => scmHandlers.current?.checkForNew()
		});
	// the one way to another branch: not in the panel, where a writer would meet it without needing
	// it, but here for whoever landed on another branch and wants to go back
	if (a.canGit() && scmHandlers.current?.canSwitchBranch())
		items.push({
			id: 'view.switchBranch',
			label: m.vcs_branch_switch(),
			group,
			keywords: 'git branch checkout switch',
			icon: GitBranch,
			run: () => commandPalette.show('branches')
		});
	// the merge's two ends, beside the panel's buttons for them: VS Code has Git: Abort Merge here too
	if (a.canGit() && scmHandlers.current?.canFinishMerge())
		items.push(
			{
				id: 'view.completeMerge',
				label: m.vcs_finish_combine(),
				group,
				keywords: 'git merge conflicts finish continue commit',
				icon: GitMerge,
				run: () => scmHandlers.current?.finishMerge()
			},
			{
				id: 'view.abortMerge',
				label: m.vcs_cancel_combine(),
				group,
				keywords: 'git merge cancel abort undo',
				icon: Undo2,
				run: () => scmHandlers.current?.abortMerge()
			}
		);
	return items;
}
