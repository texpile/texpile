<script lang="ts">
	import { Check, ChevronUp } from '@lucide/svelte';
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { shortcutText } from './menubar/shortcutText';
	import { menuBarItemClass, menuContentClass, separatorClass } from '../ui/menuStyles';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const PRESETS = [50, 75, 100, 150, 200, 400];
	const percent = $derived(props.editor.viewport.percent);

	function selectZoom(value: string) {
		if (value === 'fit') props.editor.fitView();
		else props.editor.viewport.zoomToPercent(Number(value));
	}
</script>

<!-- Texpile's PDF zoom: the percentage opens fit and the usual sizes, upward from the canvas's corner -->
<Menu positioning={{ placement: 'top-start' }} onSelect={(d) => selectZoom(d.value)}>
	<Menu.Trigger class="rounded-base hover:preset-tonal flex h-7 items-center gap-0.5 px-1.5 text-xs tabular-nums" aria-label="Zoom">
		<span class="min-w-9 text-center">{percent}%</span>
		<ChevronUp class="size-3 shrink-0 opacity-60" />
	</Menu.Trigger>
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={menuContentClass}>
				<Menu.Item value="fit" class={menuBarItemClass}>
					<Menu.ItemText>Fit the sheet</Menu.ItemText>
					<span class="opacity-50">{shortcutText('1', { mod: false, shift: true })}</span>
				</Menu.Item>
				<Menu.Separator class={separatorClass} />
				{#each PRESETS as p (p)}
					<Menu.Item value={String(p)} class={menuBarItemClass}>
						<Menu.ItemText>{p}%</Menu.ItemText>
						<Check class="size-4 shrink-0 {p === percent ? '' : 'invisible'}" />
					</Menu.Item>
				{/each}
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
