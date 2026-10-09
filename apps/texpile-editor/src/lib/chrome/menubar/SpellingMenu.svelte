<script lang="ts">
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import { Check } from '@lucide/svelte';
	import MenuBarTrigger from './MenuBarTrigger.svelte';
	import MenuBarSubmenu from './MenuBarSubmenu.svelte';
	import { menuContentClass, menuBarItemClass, separatorClass } from '$lib/menus/menuStyles';
	import type { FolderLanguageItem } from '$lib/editor/spellcheck/languages/folderLanguageMenu';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		index: number;
		select: (value: string) => void;
		editable: boolean;
		spellcheckOn: boolean;
		languages: FolderLanguageItem[];
		/** a guest's: the folder's language is the host's to choose */
		languagesFixed: boolean;
	};

	const props: Props = $props();
</script>

<Menu onSelect={(d) => props.select(d.value)}>
	<MenuBarTrigger id="spelling" index={props.index} label={m.menubar_menu_spelling()} disabled={!props.editable} />
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={menuContentClass}>
				<Menu.Item value="toggle" class={menuBarItemClass}>
					<Menu.ItemText>{m.menubar_check_spelling()}</Menu.ItemText>
					{#if props.spellcheckOn}<Check class="size-4" />{/if}
				</Menu.Item>
				<MenuBarSubmenu value="language" label={m.spelling_folder_language()} select={(value) => props.select(`lang:${value}`)}>
					{#each props.languages as item, i (item.value)}
						<Menu.Item value={item.value} class={menuBarItemClass} disabled={props.languagesFixed}>
							<Menu.ItemText>{item.label}</Menu.ItemText>
							{#if item.checked}<Check class="size-4" />{/if}
						</Menu.Item>
						{#if i === 0}<Menu.Separator class={separatorClass} />{/if}
					{/each}
				</MenuBarSubmenu>
				<Menu.Separator class={separatorClass} />
				<Menu.Item value="dictionary" class={menuBarItemClass}><Menu.ItemText>{m.menubar_edit_dictionary()}</Menu.ItemText></Menu.Item>
				<Menu.Item value="settings" class={menuBarItemClass}><Menu.ItemText>{m.menubar_spelling_settings()}</Menu.ItemText></Menu.Item>
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
