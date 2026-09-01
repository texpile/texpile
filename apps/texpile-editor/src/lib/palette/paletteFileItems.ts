import { FilePlus2, FolderOpen, Play, RefreshCw, RotateCw, Save, Settings, Users, Wrench } from '@lucide/svelte';
import { isDirty } from '$lib/workspace/workspaceStore';
import { nativeBridge } from '$lib/workspace/fileSystem';
import { confirmAsk } from '$lib/modals/confirm.svelte';
import { collabHost } from '$lib/collab/hostStore.svelte';
import { combo } from '$lib/chrome/shortcutText';
import type { PaletteActions } from '$lib/workspace/commandPalette.svelte';
import type { PaletteItem } from './paletteCommands';
import { m } from '$lib/paraglide/messages';

export function fileItems(a: PaletteActions): PaletteItem[] {
	const items: PaletteItem[] = [];
	const group = m.palette_group_file();
	if (a.hasFile())
		items.push({
			id: 'file.save',
			label: m.menubar_save(),
			group,
			keywords: 'write disk',
			hint: combo('S'),
			icon: Save,
			run: () => a.save()
		});
	if (a.canManageTree()) {
		// the compile target decides the document rows, exactly as in the File > New menus:
		// .typ for a Typst project, .tex otherwise; .bib and markdown serve both
		if (a.isTypstProject()) {
			items.push({
				id: 'file.newTyp',
				label: m.menubar_new_typ(),
				group,
				keywords: 'create add document typst',
				icon: FilePlus2,
				run: () => a.newFile('typ')
			});
			if (a.isHostWorkspace())
				items.push({
					id: 'typst.preview',
					label: m.typst_preview_open(),
					group,
					keywords: 'typst live preview watch tinymist',
					icon: Play,
					run: () => a.openTypstPreview()
				});
		} else {
			items.push({
				id: 'file.newTex',
				label: m.menubar_new_tex(),
				group,
				keywords: 'create add document',
				icon: FilePlus2,
				run: () => a.newFile('tex')
			});
		}
		items.push({
			id: 'file.newBib',
			label: m.menubar_new_bib(),
			group,
			keywords: 'create add bibliography references',
			icon: FilePlus2,
			run: () => a.newFile('bib')
		});
		items.push({
			id: 'file.newMd',
			label: m.menubar_new_md(),
			group,
			keywords: 'create add document markdown notes',
			icon: FilePlus2,
			run: () => a.newFile('md')
		});
	}
	if (a.isHostWorkspace())
		items.push({
			id: 'file.openFolder',
			label: m.menubar_open_new_folder(),
			group,
			keywords: 'project workspace directory',
			icon: FolderOpen,
			run: () => a.openFolder()
		});
	items.push({
		id: 'file.refreshTree',
		label: m.wsview_refresh_tree_title(),
		group,
		keywords: 'reload rescan',
		icon: RefreshCw,
		run: () => a.refreshTree()
	});
	// Full renderer reload, VS Code's "Reload Window": the recovery move when something is stuck.
	// Through the main process, not location.reload(): the workspace root is memory-only, so a bare
	// reload forgets the folder and lands on Start - main re-queues the folder push instead, the
	// same path session restore uses, which also reopens the last file. Hosts only: a guest's
	// "workspace" is the live session, and reloading is just disconnecting.
	if (a.isHostWorkspace() && nativeBridge()?.reloadWorkspace)
		items.push({
			id: 'window.reload',
			label: m.palette_reload_workspace(),
			group,
			keywords: 'restart window refresh reset stuck',
			icon: RotateCw,
			run: async () => {
				// hosting outranks a dirty buffer: the reload drops every guest (session keys are
				// memory-only), and that is the surprise worth one dialog. Never both dialogs.
				if (collabHost.active) {
					if (!(await confirmAsk(m.palette_reload_sharing_confirm(), { danger: true }))) return;
				} else if (isDirty.current && !(await confirmAsk(m.palette_reload_unsaved_confirm(), { danger: true }))) return;
				nativeBridge()?.reloadWorkspace?.();
			}
		});
	// searchOnly, and deliberately untranslated: it is a diagnostic, and English is what a support
	// note or a web search will name, so a localized label would make it harder to talk someone to.
	// The palette is its ONLY way in - no menu item, no shortcut (see electron windowChrome.ts).
	if (nativeBridge()?.toggleDevTools)
		items.push({
			id: 'window.devtools',
			label: 'Toggle Developer Tools',
			group,
			keywords: 'devtools debug console inspect diagnostics',
			icon: Wrench,
			searchOnly: true,
			run: () => nativeBridge()?.toggleDevTools?.()
		});
	items.push({
		id: 'file.preferences',
		label: m.menubar_preferences(),
		group,
		keywords: 'settings options config',
		icon: Settings,
		run: () => a.openPreferences()
	});
	// the other half of the app-icon menu, so everything in there is reachable from here too
	if (a.openShareSession)
		items.push({
			id: 'file.shareSession',
			label: m.menubar_share_session(),
			group,
			keywords: 'collaborate invite guest live together',
			icon: Users,
			run: () => a.openShareSession?.()
		});
	return items;
}
