<script lang="ts">
	import { Minus, Plus, Settings } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { isReadOnly } from '$lib/stores/permissionStore';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		/** a grid's cell count; null for any other call */
		gear: { cells: number | null };
		onopen: () => void;
		onadd: () => void;
		onremove: () => void;
	};

	const props: Props = $props();
</script>

{#if !isReadOnly.current}
	<div class="flex items-center">
		{#if props.gear.cells !== null}
			<button
				type="button"
				class="btn-icon btn-icon-sm hover:preset-tonal text-muted"
				aria-label={m.typ_layout_add_cell()}
				use:tip={m.typ_layout_add_cell()}
				onmousedown={(event) => event.preventDefault()}
				onclick={props.onadd}
			>
				<Plus size={14} />
			</button>
			<button
				type="button"
				class="btn-icon btn-icon-sm hover:preset-tonal text-muted"
				aria-label={m.typ_layout_remove_cell()}
				disabled={props.gear.cells < 2}
				use:tip={m.typ_layout_remove_cell()}
				onmousedown={(event) => event.preventDefault()}
				onclick={props.onremove}
			>
				<Minus size={14} />
			</button>
		{/if}
		<button
			type="button"
			class="btn-icon btn-icon-sm hover:preset-tonal text-muted"
			aria-label={m.typ_layout_settings()}
			use:tip={m.typ_layout_settings()}
			onmousedown={(event) => event.preventDefault()}
			onclick={props.onopen}
		>
			<Settings size={14} />
		</button>
	</div>
{/if}
