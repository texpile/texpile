<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import { ChevronRight } from '@lucide/svelte';
	import MenuBarTrigger from './MenuBarTrigger.svelte';
	import { contentClass, itemClass, separatorClass } from './menuBarStyles';
	import { recentFolders } from '$lib/workspace/workspaceStore';
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
		canOpenFolder: boolean;
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
		canOpenFolder,
		canCloseWorkspace,
		canShareSession
	}: Props = $props();
</script>

<Menu onSelect={(d) => select(d.value)}>
	<MenuBarTrigger id="file" {index} label={m.menubar_menu_file()} />
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={contentClass}>
				{#if canNewFile}
					<Menu onSelect={(d) => newFileSelect(d.value)}>
						<Menu.TriggerItem value="new" class={itemClass}>
							<Menu.ItemText>{m.menubar_new_file_menu()}</Menu.ItemText><ChevronRight class="size-4 opacity-60" />
						</Menu.TriggerItem>
						<Portal>
							<Menu.Positioner>
								<!-- the compile target decides the document options: a Typst project is not
								     served by .tex/.cls/.sty rows and vice versa. .bib works for both (Typst
								     reads BibTeX directly) and markdown is format-neutral, so those stay. -->
								<Menu.Content class={contentClass}>
									{#if typstProject}
										<Menu.Item value="typ" class={itemClass}><Menu.ItemText>{m.menubar_new_typ()}</Menu.ItemText></Menu.Item>
									{:else}
										<Menu.Item value="tex" class={itemClass}><Menu.ItemText>{m.menubar_new_tex()}</Menu.ItemText></Menu.Item>
									{/if}
									<Menu.Item value="bib" class={itemClass}><Menu.ItemText>{m.menubar_new_bib()}</Menu.ItemText></Menu.Item>
									<Menu.Item value="md" class={itemClass}><Menu.ItemText>{m.menubar_new_md()}</Menu.ItemText></Menu.Item>
									{#if !typstProject}
										<Menu.Item value="cls" class={itemClass}><Menu.ItemText>{m.menubar_new_cls()}</Menu.ItemText></Menu.Item>
										<Menu.Item value="sty" class={itemClass}><Menu.ItemText>{m.menubar_new_sty()}</Menu.ItemText></Menu.Item>
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
						<Menu.TriggerItem value="openfolder" class={itemClass}>
							<Menu.ItemText>{m.menubar_open_folder_menu()}</Menu.ItemText><ChevronRight class="size-4 opacity-60" />
						</Menu.TriggerItem>
						<Portal>
							<Menu.Positioner>
								<Menu.Content class={contentClass}>
									<Menu.Item value="newfolder" class={itemClass}><Menu.ItemText>{m.menubar_open_new_folder()}</Menu.ItemText></Menu.Item>
									{#if recentFolders.current.length > 0}
										<Menu.Separator class={separatorClass} />
										<div class="text-muted px-2.5 py-0.5 text-xs font-semibold tracking-wider uppercase">
											{m.menubar_recent_heading()}
										</div>
										{#each recentFolders.current as folder (folder)}
											<Menu.Item value={folder} class={itemClass}>
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
				{#if isDesktop()}
					<Menu.Separator class={separatorClass} />
					<Menu.Item value="new-window" class={itemClass}>
						<Menu.ItemText>{m.menubar_new_window()}</Menu.ItemText><span class="opacity-50">{combo('N', { shift: true })}</span>
					</Menu.Item>
					<Menu.Item value="open-folder-new-window" class={itemClass}>
						<Menu.ItemText>{m.menubar_open_folder_new_window()}</Menu.ItemText>
					</Menu.Item>
				{/if}
				<Menu.Separator class={separatorClass} />
				<Menu.Item value="save" class={itemClass}>
					<Menu.ItemText>{m.menubar_save()}</Menu.ItemText><span class="opacity-50">{combo('S')}</span>
				</Menu.Item>
				{#if canCloseWorkspace}
					<Menu.Item value="close-workspace" class={itemClass}><Menu.ItemText>{m.menubar_close_workspace()}</Menu.ItemText></Menu.Item>
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
					<Menu.Item value="share-session" class={itemClass}><Menu.ItemText>{m.menubar_share_session()}</Menu.ItemText></Menu.Item>
				{/if}
				<Menu.Item value="preferences" class={itemClass}>
					<Menu.ItemText>{m.menubar_preferences()}</Menu.ItemText><span class="opacity-50">{combo(',')}</span>
				</Menu.Item>
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
