<script lang="ts">
	// Edit › Spelling: the two things changed while writing; the dictionary and grammar rules live in Preferences
	import { Menu } from '@skeletonlabs/skeleton-svelte';
	import { Check } from '@lucide/svelte';
	import MenuBarSubmenu from './MenuBarSubmenu.svelte';
	import { menuBarItemClass, separatorClass } from '$lib/menus/menuStyles';
	import type { FolderLanguageItem } from '$lib/editor/spellcheck/languages/folderLanguageMenu';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		select: (value: string) => void;
		editable: boolean;
		spellcheckOn: boolean;
		languages: FolderLanguageItem[];
		/** a guest's: the folder's language is the host's to choose */
		languagesFixed: boolean;
	};

	const props: Props = $props();
</script>

<MenuBarSubmenu value="spelling" label={m.menubar_menu_spelling()} select={props.select} disabled={!props.editable}>
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
</MenuBarSubmenu>
