<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import { ChevronRight } from '@lucide/svelte';
	import MenuBarTrigger from './MenuBarTrigger.svelte';
	import { menuContentClass, menuBarItemClass, separatorClass } from '$lib/menus/menuStyles';
	import { recentFolders } from '$lib/workspace/workspaceStore';
	import { fileMode } from '$lib/workspace/fileMode.svelte';
	import { basename, isDesktop } from '$lib/workspace/fileSystem';
	import { combo } from '$lib/chrome/shortcutText';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		index: number;
		select: (value: string) => void;
		newFileSelect: (ext: string) => void;
		openFolderSelect: (value: string) => void;
		canNewFile: boolean;
		typstProject: boolean;
		/** the main file is Typst and tinymist can export it (see languages/typst/export) */
		canExportTypst: boolean;
		canOpenFolder: boolean;
		canSaveAsTemplate: boolean;
		canClone?: boolean;
		/** the File menu's Local History items: the host's own workspace */
		canLocalHistory?: boolean;
		/** a file is open, for Local History… */
		fileOpen?: boolean;
		canCloseWorkspace: boolean;
		canShareSession: boolean;
	};

	let {
		index,
		select,
		newFileSelect,
		openFolderSelect,
		canNewFile,
		typstProject,
		canExportTypst,
		canOpenFolder,
		canSaveAsTemplate,
		canClone = false,
		canLocalHistory = false,
		fileOpen = false,
		canCloseWorkspace,
		canShareSession
	}: Props = $props();
</script>

<Menu onSelect={(d) => select(d.value)}>
	<MenuBarTrigger id="file" {index} label={m.menubar_menu_file()} />
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={menuContentClass}>
				{#if canNewFile}
					<Menu onSelect={(d) => newFileSelect(d.value)}>
						<Menu.TriggerItem value="new" class={menuBarItemClass}>
							<Menu.ItemText>{m.menubar_new_file_menu()}</Menu.ItemText><ChevronRight class="size-4 opacity-60" />
						</Menu.TriggerItem>
						<Portal>
							<Menu.Positioner>
								<!-- the compile target decides the document options: a Typst project is not
								     served by .tex/.cls/.sty rows and vice versa. .bib works for both (Typst
								     reads BibTeX directly) and markdown is format-neutral, so those stay. -->
								<Menu.Content class={menuContentClass}>
									{#if typstProject}
										<Menu.Item value="typ" class={menuBarItemClass}><Menu.ItemText>{m.menubar_new_typ()}</Menu.ItemText></Menu.Item>
									{:else}
										<Menu.Item value="tex" class={menuBarItemClass}><Menu.ItemText>{m.menubar_new_tex()}</Menu.ItemText></Menu.Item>
									{/if}
									<Menu.Item value="bib" class={menuBarItemClass}><Menu.ItemText>{m.menubar_new_bib()}</Menu.ItemText></Menu.Item>
									<Menu.Item value="md" class={menuBarItemClass}><Menu.ItemText>{m.menubar_new_md()}</Menu.ItemText></Menu.Item>
									{#if !typstProject}
										<Menu.Item value="cls" class={menuBarItemClass}><Menu.ItemText>{m.menubar_new_cls()}</Menu.ItemText></Menu.Item>
										<Menu.Item value="sty" class={menuBarItemClass}><Menu.ItemText>{m.menubar_new_sty()}</Menu.ItemText></Menu.Item>
									{/if}
								</Menu.Content>
							</Menu.Positioner>
						</Portal>
					</Menu>
				{/if}
				<!-- withheld from a guest: swapping the workspace out would abandon the session
				     without leaving it, and nothing tears one down on a workspace change - the
				     Leave button is the only path that calls collabGuest.leave() -->
				{#if canOpenFolder}
					<Menu onSelect={(d) => openFolderSelect(d.value)}>
						<Menu.TriggerItem value="openfolder" class={menuBarItemClass}>
							<Menu.ItemText>{m.menubar_open_folder_menu()}</Menu.ItemText><ChevronRight class="size-4 opacity-60" />
						</Menu.TriggerItem>
						<Portal>
							<Menu.Positioner>
								<Menu.Content class={menuContentClass}>
									<Menu.Item value="newfolder" class={menuBarItemClass}
										><Menu.ItemText>{m.menubar_open_new_folder()}</Menu.ItemText></Menu.Item
									>
									{#if recentFolders.current.length > 0}
										<Menu.Separator class={separatorClass} />
										<div class="text-muted px-2.5 py-0.5 text-xs font-semibold tracking-wider uppercase">
											{m.menubar_recent_heading()}
										</div>
										{#each recentFolders.current as folder (folder)}
											<Menu.Item value={folder} class={menuBarItemClass}>
												<Menu.ItemText class="block max-w-64 truncate">
													{#snippet element(attrs)}
														<div {...attrs} use:tip={folder}>{basename(folder)}</div>
													{/snippet}
												</Menu.ItemText>
											</Menu.Item>
										{/each}
									{/if}
								</Menu.Content>
							</Menu.Positioner>
						</Portal>
					</Menu>
				{/if}
				{#if canClone}
					<Menu.Item value="clone" class={menuBarItemClass}><Menu.ItemText>{m.menubar_clone_repository()}</Menu.ItemText></Menu.Item>
				{/if}
				{#if isDesktop()}
					<Menu.Separator class={separatorClass} />
					<Menu.Item value="new-window" class={menuBarItemClass}>
						<Menu.ItemText>{m.menubar_new_window()}</Menu.ItemText><span class="opacity-50">{combo('N', { shift: true })}</span>
					</Menu.Item>
					<Menu.Item value="open-folder-new-window" class={menuBarItemClass}>
						<Menu.ItemText>{m.menubar_open_folder_new_window()}</Menu.ItemText>
					</Menu.Item>
				{/if}
				<Menu.Separator class={separatorClass} />
				<Menu.Item value="save" class={menuBarItemClass}>
					<Menu.ItemText>{m.menubar_save()}</Menu.ItemText><span class="opacity-50">{combo('S')}</span>
				</Menu.Item>
				{#if canSaveAsTemplate}
					<Menu.Item value="save-as-template" class={menuBarItemClass}
						><Menu.ItemText>{m.menubar_save_as_template()}</Menu.ItemText></Menu.Item
					>
				{:else if fileMode.current}
					<!-- grayed for a lone file rather than left out, with why -->
					<Menu.Item value="save-as-template" disabled class={menuBarItemClass}
						><Menu.ItemText><span use:tip={m.single_file_unavailable()}>{m.menubar_save_as_template()}</span></Menu.ItemText></Menu.Item
					>
				{/if}
				{#if canExportTypst}
					<Menu.Item value="export-typst" class={menuBarItemClass}><Menu.ItemText>{m.typst_export_menu()}</Menu.ItemText></Menu.Item>
				{/if}
				<!-- under File, where Word and Google Docs keep version history and writers look first -->
				{#if canLocalHistory}
					<Menu.Item value="local-history" class={menuBarItemClass} disabled={!fileOpen}
						><Menu.ItemText>{m.history_menu_open()}</Menu.ItemText></Menu.Item
					>
					<Menu.Item value="restore-deleted" class={menuBarItemClass}
						><Menu.ItemText>{m.history_menu_restore_deleted()}</Menu.ItemText></Menu.Item
					>
				{/if}
				{#if canCloseWorkspace}
					<Menu.Item value="close-workspace" class={menuBarItemClass}
						><Menu.ItemText>{m.menubar_close_workspace()}</Menu.ItemText></Menu.Item
					>
				{/if}
				<!-- Windows and Linux only: the whole bar is hidden under native menus, and on macOS these
				     two live in the application menu, which is where a mac user reaches for them.
				     They sat in the app-icon dropdown for a while so both platforms would agree on
				     placement, which was the wrong kind of agreement - macOS puts Preferences in the
				     app menu because it HAS one, and Windows puts it in File. The title-bar icon is
				     also where Windows draws the system menu, so it was a spot already spoken for.
				     Last in the menu, after a rule, the way Word and VS Code order it. -->
				<Menu.Separator class={separatorClass} />
				{#if canShareSession}
					<Menu.Item value="share-session" class={menuBarItemClass}><Menu.ItemText>{m.menubar_share_session()}</Menu.ItemText></Menu.Item>
				{:else if fileMode.current}
					<Menu.Item value="share-session" disabled class={menuBarItemClass}
						><Menu.ItemText><span use:tip={m.single_file_unavailable()}>{m.menubar_share_session()}</span></Menu.ItemText></Menu.Item
					>
				{/if}
				<Menu.Item value="preferences" class={menuBarItemClass}>
					<Menu.ItemText>{m.menubar_preferences()}</Menu.ItemText><span class="opacity-50">{combo(',')}</span>
				</Menu.Item>
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
