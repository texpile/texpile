<script lang="ts">
	import { Check, ChevronDown, LayoutDashboard, PanelLeft, PanelRight } from '@lucide/svelte';
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { menuContentClass, menuItemClass } from '../ui/menuStyles';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const panes = $derived(props.editor.panes);
	const panels = $derived([
		{ value: 'code', label: 'Code', icon: PanelLeft, open: panes.codeOpen },
		{ value: 'side', label: 'Objects and inspector', icon: PanelRight, open: panes.sideShown }
	]);

	function togglePanel(value: string) {
		if (value === 'code') panes.toggleCode();
		else panes.toggleSide();
	}
</script>

<!-- Texpile's title-bar Layout button -->
<Menu onSelect={(d) => togglePanel(d.value)} positioning={{ placement: 'bottom-end' }}>
	<Menu.Trigger class="hover:bg-surface-200-800 rounded-base flex h-[22px] items-center gap-1 self-center px-1.5 text-xs">
		<LayoutDashboard class="size-3.5" />
		<span class="cap-center">Layout</span>
		<ChevronDown class="size-3 opacity-60" />
	</Menu.Trigger>
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={menuContentClass}>
				<Menu.ItemGroup>
					<Menu.ItemGroupLabel class="text-muted px-1 text-xs">Panels</Menu.ItemGroupLabel>
					{#each panels as p (p.value)}
						<Menu.Item value={p.value} class={menuItemClass}>
							<p.icon class="size-4" />
							<Menu.ItemText class="flex-1">{p.label}</Menu.ItemText>
							<Check class="size-4 {p.open ? '' : 'invisible'}" />
						</Menu.Item>
					{/each}
				</Menu.ItemGroup>
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
