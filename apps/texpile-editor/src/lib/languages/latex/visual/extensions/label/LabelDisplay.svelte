<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { Tag } from '@lucide/svelte';
	import { sanitizeLabel } from '$lib/editor/visual/label';
	import { m } from '$lib/paraglide/messages';

	let { name, onRename }: { name: string; onRename: (next: string) => void } = $props();

	let open = $state(false);
	let draft = $state('');

	// seeded on open, not on mount: the node's name can change under us (a rename elsewhere, undo)
	function onOpenChange(next: boolean) {
		if (next) draft = name;
		open = next;
	}

	function commit() {
		onRename(sanitizeLabel(draft));
		open = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			open = false;
		}
	}
</script>

<Popover {open} onOpenChange={(e) => onOpenChange(e.open)} positioning={{ placement: 'bottom-start', offset: { mainAxis: 4 } }}>
	<Popover.Trigger
		class="text-surface-600-300 bg-surface-200-800 hover:bg-surface-300-700 inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 align-baseline text-xs font-medium transition-colors"
		style="font-size: 0.75rem;"
	>
		{#snippet element(attrs)}
			<button {...attrs} use:tip={m.label_chip_title({ name })}>
				<Tag class="size-3 shrink-0" />
				<span class="font-mono">{name}</span>
			</button>
		{/snippet}
	</Popover.Trigger>

	<Portal>
		<Popover.Positioner class="z-floating-ui">
			<Popover.Content class="card bg-surface-50-950 border-surface-300-700 z-[200] min-w-[260px] border p-3 shadow-lg">
				<label class="block">
					<span class="text-surface-900-100 text-sm font-medium">{m.label_rename_heading()}</span>
					<input class="input mt-1.5 w-full font-mono text-sm" bind:value={draft} onkeydown={onKeydown} />
					<span class="text-surface-500-400 mt-1 block text-xs">{m.label_rename_hint()}</span>
				</label>
				<button type="button" class="btn btn-sm preset-filled-primary-500 mt-3 w-full" onclick={commit}>
					{m.label_rename_confirm()}
				</button>
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>
<!-- zero-width space so the cursor can land after the chip -->
<span style="font-size: 1rem;">&#8203;</span>
