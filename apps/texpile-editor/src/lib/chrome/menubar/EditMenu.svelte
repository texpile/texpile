<script lang="ts">
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import MenuBarTrigger from './MenuBarTrigger.svelte';
	import { contentClass, itemClass, separatorClass } from './menuBarStyles';
	import { combo } from '$lib/chrome/shortcutText';
	import { m } from '$lib/paraglide/messages';

	let { index, select, editable }: { index: number; select: (value: string) => void; editable: boolean } = $props();
</script>

<Menu onSelect={(d) => select(d.value)}>
	<MenuBarTrigger id="edit" {index} label={m.menubar_menu_edit()} disabled={!editable} />
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={contentClass}>
				<Menu.Item value="palette" class={itemClass}>
					<Menu.ItemText>{m.palette_open()}</Menu.ItemText><span class="opacity-50">{combo('K')}</span>
				</Menu.Item>
				<Menu.Item value="goToFile" class={itemClass}>
					<Menu.ItemText>{m.palette_group_go()}</Menu.ItemText><span class="opacity-50">{combo('T')}</span>
				</Menu.Item>
				<Menu.Separator class={separatorClass} />
				<Menu.Item value="undo" class={itemClass}
					><Menu.ItemText>{m.menubar_undo()}</Menu.ItemText><span class="opacity-50">{combo('Z')}</span></Menu.Item
				>
				<Menu.Item value="redo" class={itemClass}
					><Menu.ItemText>{m.menubar_redo()}</Menu.ItemText><span class="opacity-50">{combo('Z', { shift: true })}</span></Menu.Item
				>
				<Menu.Separator class={separatorClass} />
				<Menu.Item value="find" class={itemClass}
					><Menu.ItemText>{m.menubar_find()}</Menu.ItemText><span class="opacity-50">{combo('F')}</span></Menu.Item
				>
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
