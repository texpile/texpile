import { CloudDownload, Columns2, Eye, GitBranch, GitCompare, GitMerge, PanelLeft, Search, Undo2 } from '@lucide/svelte';
import { COLOR_VISION_MODES, colorVisionLabel } from '$lib/preview/colorVision/colorVision';
import { m } from '$lib/paraglide/messages';
import type { CommandInfo } from '../commands/commandRegistry';

function category(): string {
	return m.palette_group_view();
}

export const VIEW_COMMANDS: CommandInfo[] = [
	{ id: 'view.visual', title: () => m.palette_show_visual(), category, palette: { keywords: 'wysiwyg rendered preview mode', icon: Eye } },
	{ id: 'view.source', title: () => m.palette_show_source(), category, palette: { keywords: 'latex code raw mode', icon: Columns2 } },
	{ id: 'view.diff', title: () => m.palette_show_diff(), category, palette: { keywords: 'git changes compare commit', icon: GitCompare } },
	{
		id: 'view.sidebar',
		title: () => m.keybindings_cmd_toggle_sidebar(),
		category,
		palette: { keywords: 'explorer files panel', icon: PanelLeft }
	},
	// the simulations are found by typing (color, blind, protan...) rather than listed, four rows of one feature in the
	// browse list; the way back is listed while on
	...COLOR_VISION_MODES.map((mode): CommandInfo => ({
		id: `view.colorVision.${mode}`,
		title: () => (mode === 'none' ? m.color_vision_off() : m.color_vision_palette({ mode: colorVisionLabel(mode) })),
		category,
		palette: {
			keywords: 'color colour vision blind blindness deficiency accessibility simulate preview',
			icon: Eye,
			searchOnly: mode !== 'none'
		}
	})),
	{ id: 'view.findInFiles', title: () => m.wsview_find_in_files(), category, palette: { keywords: 'grep search project', icon: Search } },
	{
		id: 'view.sourceControl',
		title: () => m.palette_source_control(),
		category,
		palette: { keywords: 'git scm version commit save changes history', icon: GitBranch }
	},
	{
		id: 'view.checkForNew',
		title: () => m.vcs_fetch(),
		category,
		palette: { keywords: 'git fetch remote co-author upstream github new versions', icon: CloudDownload }
	},
	{
		id: 'view.switchBranch',
		title: () => m.vcs_branch_switch(),
		category,
		palette: { keywords: 'git branch checkout switch', icon: GitBranch }
	},
	{
		id: 'view.completeMerge',
		title: () => m.vcs_finish_combine(),
		category,
		palette: { keywords: 'git merge conflicts finish continue commit', icon: GitMerge }
	},
	{
		id: 'view.abortMerge',
		title: () => m.vcs_cancel_combine(),
		category,
		palette: { keywords: 'git merge cancel abort undo', icon: Undo2 }
	}
];
