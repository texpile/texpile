import {
	FileOutput,
	FilePlus2,
	FolderGit2,
	FolderOpen,
	Github,
	History,
	KeyRound,
	LayoutTemplate,
	Play,
	RefreshCw,
	RotateCw,
	Save,
	Settings,
	Users,
	Wrench
} from '@lucide/svelte';
import { m } from '$lib/paraglide/messages';
import type { CommandInfo } from '../commands/commandRegistry';

function category(): string {
	return m.palette_group_file();
}
const history = 'local history copies versions restore recover';

export const FILE_COMMANDS: CommandInfo[] = [
	{ id: 'file.save', title: () => m.menubar_save(), category, palette: { keywords: 'write disk', icon: Save } },
	{
		id: 'typst.export',
		title: () => m.typst_export_palette(),
		category,
		palette: { keywords: 'typst export pdf png svg html image pdf/a pdf/ua accessible tinymist', icon: FileOutput }
	},
	{ id: 'file.newTyp', title: () => m.menubar_new_typ(), category, palette: { keywords: 'create add document typst', icon: FilePlus2 } },
	{
		id: 'typst.preview',
		title: () => m.typst_preview_open(),
		category,
		palette: { keywords: 'typst live preview watch tinymist', icon: Play }
	},
	{ id: 'file.newTex', title: () => m.menubar_new_tex(), category, palette: { keywords: 'create add document', icon: FilePlus2 } },
	{
		id: 'file.newBib',
		title: () => m.menubar_new_bib(),
		category,
		palette: { keywords: 'create add bibliography references', icon: FilePlus2 }
	},
	{
		id: 'file.newMd',
		title: () => m.menubar_new_md(),
		category,
		palette: { keywords: 'create add document markdown notes', icon: FilePlus2 }
	},
	{
		id: 'file.saveAsTemplate',
		title: () => m.menubar_save_as_template(),
		category,
		palette: { keywords: 'template starter reuse copy project', icon: LayoutTemplate }
	},
	{
		id: 'file.openFolder',
		title: () => m.start_open_folder(),
		category,
		palette: { keywords: 'project workspace directory', icon: FolderOpen }
	},
	{
		id: 'file.clone',
		title: () => m.palette_clone_repository(),
		category,
		palette: { keywords: 'git github download repository remote', icon: FolderGit2 }
	},
	{
		id: 'file.githubAccount',
		title: () => m.keybindings_cmd_github_account(),
		category,
		palette: { keywords: 'github account login logout browser oauth token', icon: Github }
	},
	{
		id: 'file.localHistory',
		title: () => m.palette_history_open(),
		category,
		palette: { keywords: `${history} lost text backup undo timeline`, icon: History }
	},
	{
		id: 'file.restoreDeleted',
		title: () => m.palette_history_find(),
		category,
		palette: { keywords: `${history} deleted lost file copy backup undo find entry`, icon: History }
	},
	{
		id: 'file.forgetSignIns',
		title: () => m.palette_forget_signins(),
		category,
		palette: { keywords: 'git password token credential keychain github sign in login logout', icon: KeyRound }
	},
	{ id: 'file.refreshTree', title: () => m.wsview_refresh_tree_title(), category, palette: { keywords: 'reload rescan', icon: RefreshCw } },
	{
		id: 'window.reload',
		title: () => m.palette_reload_workspace(),
		category,
		palette: { keywords: 'restart window refresh reset stuck', icon: RotateCw }
	},
	// searchOnly, and deliberately untranslated: it is a diagnostic, and English is what a support note or a web search
	// will name. The palette is its only way in, unless someone gives it a key
	{
		id: 'window.devtools',
		title: () => 'Toggle Developer Tools',
		category,
		palette: { keywords: 'devtools debug console inspect diagnostics', icon: Wrench, searchOnly: true }
	},
	{
		id: 'file.preferences',
		title: () => m.menubar_preferences(),
		category,
		palette: { keywords: 'settings options config', icon: Settings }
	},
	{
		id: 'file.shareSession',
		title: () => m.menubar_share_session(),
		category,
		palette: { keywords: 'collaborate invite guest live together', icon: Users }
	}
];
