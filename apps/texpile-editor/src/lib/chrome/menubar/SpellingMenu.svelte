<script lang="ts">
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import { Check } from '@lucide/svelte';
	import MenuBarTrigger from './MenuBarTrigger.svelte';
	import { menuContentClass, menuBarItemClass, separatorClass } from '$lib/menus/menuStyles';
	import { m } from '$lib/paraglide/messages';

	let {
		index,
		select,
		editable,
		spellcheckOn
	}: { index: number; select: (value: string) => void; editable: boolean; spellcheckOn: boolean } = $props();
</script>

<Menu onSelect={(d) => select(d.value)}>
	<MenuBarTrigger id="spelling" {index} label={m.menubar_menu_spelling()} disabled={!editable} />
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={menuContentClass}>
				<Menu.Item value="toggle" class={menuBarItemClass}>
					<Menu.ItemText>{m.menubar_check_spelling()}</Menu.ItemText>
					{#if spellcheckOn}<Check class="size-4" />{/if}
				</Menu.Item>
				<Menu.Separator class={separatorClass} />
				<Menu.Item value="dictionary" class={menuBarItemClass}><Menu.ItemText>{m.menubar_edit_dictionary()}</Menu.ItemText></Menu.Item>
				<Menu.Item value="settings" class={menuBarItemClass}><Menu.ItemText>{m.menubar_spelling_settings()}</Menu.ItemText></Menu.Item>
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
