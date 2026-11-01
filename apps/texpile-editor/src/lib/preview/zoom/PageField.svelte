<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';

	type Props = { page: number; total: number; label: string; ongo: (page: number) => void };
	const props: Props = $props();

	function go(e: Event & { currentTarget: HTMLInputElement }): void {
		const input = e.currentTarget;
		const page = parseInt(input.value, 10);
		if (page >= 1 && page <= props.total) props.ongo(page);
		else input.value = String(props.page);
	}
</script>

<label class="page-field" style:--digits={String(props.total).length} use:tip={props.label}>
	<input
		type="number"
		value={props.page}
		min="1"
		max={props.total}
		aria-label={props.label}
		onfocus={(e) => e.currentTarget.select()}
		onchange={go}
	/>
	<span>/ {props.total}</span>
</label>

<style>
	.page-field {
		display: inline-flex;
		align-items: center;
		gap: calc(var(--spacing) * 1);
		height: var(--pdf-ctl, calc(var(--spacing) * 7));
		padding: 0 calc(var(--spacing) * 1.5);
		border-radius: calc(var(--radius-base) * 1.5);
		color: var(--pdf-toolbar-btn-fg);
		font-size: 0.8rem;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		cursor: text;
		transition: all 0.15s ease;
	}

	.page-field:hover,
	.page-field:focus-within {
		background-color: var(--pdf-toolbar-btn-hover-bg);
		color: var(--pdf-toolbar-fg);
	}

	.page-field:focus-within {
		box-shadow: 0 0 0 2px var(--pdf-toolbar-accent-ring);
	}

	input {
		width: calc(var(--digits, 1) * 1ch);
		padding: 0;
		border: 0;
		outline: none;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: right;
		appearance: textfield;
	}

	input::-webkit-outer-spin-button,
	input::-webkit-inner-spin-button {
		appearance: none;
		margin: 0;
	}
</style>
