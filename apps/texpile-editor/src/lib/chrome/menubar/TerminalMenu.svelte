<script lang="ts">
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import { Check } from '@lucide/svelte';
	import MenuBarTrigger from './MenuBarTrigger.svelte';
	import { menuContentClass, menuBarItemClass, separatorClass } from '$lib/menus/menuStyles';
	import { m } from '$lib/paraglide/messages';

	let { index, select, terminalVisible }: { index: number; select: (value: string) => void; terminalVisible: boolean } = $props();
</script>

<Menu onSelect={(d) => select(d.value)}>
	<MenuBarTrigger id="terminal" {index} label={m.menubar_menu_terminal()} />
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={menuContentClass}>
				<Menu.Item value="compile" class={menuBarItemClass}><Menu.ItemText>{m.menubar_terminal_compile()}</Menu.ItemText></Menu.Item>
				<Menu.Item value="configure" class={menuBarItemClass}
					><Menu.ItemText>{m.menubar_configure_compile_command()}</Menu.ItemText></Menu.Item
				>
				<Menu.Separator class={separatorClass} />
				<Menu.Item value="new" class={menuBarItemClass}><Menu.ItemText>{m.menubar_new_terminal()}</Menu.ItemText></Menu.Item>
				<Menu.Item value="toggle" class={menuBarItemClass}>
					<Menu.ItemText>{m.menubar_show_terminal()}</Menu.ItemText>
					{#if terminalVisible}<Check class="size-4" />{/if}
				</Menu.Item>
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
