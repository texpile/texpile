<script lang="ts">
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import MenuBarTrigger from './MenuBarTrigger.svelte';
	import { menuContentClass, menuBarItemClass, separatorClass } from '$lib/menus/menuStyles';
	import { isMac } from '$lib/platform';
	import { m } from '$lib/paraglide/messages';

	// color vision is not here: it is a check of the PDF, on the toolbar of each preview
	let { index, select, uiZoomPercent }: { index: number; select: (value: string) => void; uiZoomPercent: number } = $props();
</script>

<Menu onSelect={(d) => select(d.value)}>
	<MenuBarTrigger id="view" {index} label={m.menubar_menu_view()} />
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={menuContentClass}>
				<div class="text-muted px-2.5 py-1 text-xs">{m.menubar_interface_zoom({ percent: uiZoomPercent })}</div>
				<Menu.Separator class={separatorClass} />
				<Menu.Item value="zoom-in" class={menuBarItemClass}>
					<Menu.ItemText>{m.menubar_zoom_in()}</Menu.ItemText><span class="opacity-50">{isMac ? '⌘ +' : 'Ctrl +'}</span>
				</Menu.Item>
				<Menu.Item value="zoom-out" class={menuBarItemClass}>
					<Menu.ItemText>{m.menubar_zoom_out()}</Menu.ItemText><span class="opacity-50">{isMac ? '⌘ −' : 'Ctrl −'}</span>
				</Menu.Item>
				<Menu.Item value="zoom-reset" class={menuBarItemClass}>
					<Menu.ItemText>{m.menubar_zoom_reset()}</Menu.ItemText><span class="opacity-50">{isMac ? '⌘ 0' : 'Ctrl 0'}</span>
				</Menu.Item>
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
