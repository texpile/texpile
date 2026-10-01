<script lang="ts">
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import MenuBarTrigger from './MenuBarTrigger.svelte';
	import { menuContentClass, menuBarItemClass, separatorClass } from '$lib/menus/menuStyles';
	import { combo } from '$lib/chrome/shortcutText';
	import { isMac } from '$lib/platform';
	import { m } from '$lib/paraglide/messages';

	// findable without editable: a .pdf tab, where Find is the viewer's and the rest has nothing to act on
	let {
		index,
		select,
		editable,
		findable = editable
	}: { index: number; select: (value: string) => void; editable: boolean; findable?: boolean } = $props();
</script>

<Menu onSelect={(d) => select(d.value)}>
	<MenuBarTrigger id="edit" {index} label={m.menubar_menu_edit()} disabled={!editable && !findable} />
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={menuContentClass}>
				<Menu.Item value="palette" class={menuBarItemClass}>
					<Menu.ItemText>{m.palette_open()}</Menu.ItemText><span class="opacity-50">{combo('K')}</span>
				</Menu.Item>
				<Menu.Item value="goToFile" class={menuBarItemClass}>
					<Menu.ItemText>{m.palette_group_go()}</Menu.ItemText><span class="opacity-50">{combo('T')}</span>
				</Menu.Item>
				<Menu.Separator class={separatorClass} />
				<Menu.Item value="undo" class={menuBarItemClass} disabled={!editable}
					><Menu.ItemText>{m.menubar_undo()}</Menu.ItemText><span class="opacity-50">{combo('Z')}</span></Menu.Item
				>
				<Menu.Item value="redo" class={menuBarItemClass} disabled={!editable}
					><Menu.ItemText>{m.menubar_redo()}</Menu.ItemText><span class="opacity-50"
						>{isMac ? combo('Z', { shift: true }) : combo('Y')}</span
					></Menu.Item
				>
				<Menu.Separator class={separatorClass} />
				<Menu.Item value="find" class={menuBarItemClass} disabled={!findable}
					><Menu.ItemText>{m.menubar_find()}</Menu.ItemText><span class="opacity-50">{combo('F')}</span></Menu.Item
				>
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
