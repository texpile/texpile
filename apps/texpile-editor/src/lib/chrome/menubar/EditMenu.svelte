<script lang="ts">
	import { keyLabel } from '$lib/keybindings/keybindings.svelte';
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import MenuBarTrigger from './MenuBarTrigger.svelte';
	import SpellingSubmenu from './SpellingSubmenu.svelte';
	import { menuContentClass, menuBarItemClass, separatorClass } from '$lib/menus/menuStyles';
	import type { FolderLanguageItem } from '$lib/editor/spellcheck/languages/folderLanguageMenu';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		index: number;
		select: (value: string) => void;
		editable: boolean;
		/** a .pdf tab finds with nothing else to act on */
		findable?: boolean;
		spellingSelect: (value: string) => void;
		spellcheckOn: boolean;
		spellLanguages: FolderLanguageItem[];
		spellLanguagesFixed: boolean;
	};
	const props: Props = $props();
	const findable = $derived(props.findable ?? props.editable);
</script>

<Menu onSelect={(d) => props.select(d.value)}>
	<MenuBarTrigger id="edit" index={props.index} label={m.menubar_menu_edit()} disabled={!props.editable && !findable} />
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={menuContentClass}>
				<Menu.Item value="palette" class={menuBarItemClass}>
					<Menu.ItemText>{m.palette_open()}</Menu.ItemText><span class="text-muted">{keyLabel('palette.open')}</span>
				</Menu.Item>
				<Menu.Item value="goToFile" class={menuBarItemClass}>
					<Menu.ItemText>{m.palette_group_go()}</Menu.ItemText><span class="text-muted">{keyLabel('palette.goToFile')}</span>
				</Menu.Item>
				<Menu.Separator class={separatorClass} />
				<Menu.Item value="undo" class={menuBarItemClass} disabled={!props.editable}
					><Menu.ItemText>{m.menubar_undo()}</Menu.ItemText><span class="text-muted">{keyLabel('edit.undo')}</span></Menu.Item
				>
				<Menu.Item value="redo" class={menuBarItemClass} disabled={!props.editable}
					><Menu.ItemText>{m.menubar_redo()}</Menu.ItemText><span class="text-muted">{keyLabel('edit.redo')}</span></Menu.Item
				>
				<Menu.Separator class={separatorClass} />
				<Menu.Item value="find" class={menuBarItemClass} disabled={!findable}
					><Menu.ItemText>{m.menubar_find()}</Menu.ItemText><span class="text-muted">{keyLabel('editor.find')}</span></Menu.Item
				>
				<SpellingSubmenu
					select={props.spellingSelect}
					editable={props.editable}
					spellcheckOn={props.spellcheckOn}
					languages={props.spellLanguages}
					languagesFixed={props.spellLanguagesFixed}
				/>
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
