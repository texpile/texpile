<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	type ColumnWidthChipProps = { width: string; disabled: boolean; onopen: (chip: DOMRect) => void };

	const props: ColumnWidthChipProps = $props();
</script>

<button
	type="button"
	class="beamer-column-chip"
	aria-label={m.slide_column_width()}
	disabled={props.disabled}
	onclick={(e) => props.onopen(e.currentTarget.getBoundingClientRect())}>{props.width}</button
>

<style>
	.beamer-column-chip {
		display: block;
		max-width: 100%;
		margin: 0 auto;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 0 calc(var(--spacing) * 1.5);
		font-family: var(--font-mono, monospace);
		font-size: 0.7rem;
		line-height: calc(var(--spacing) * 5);
		color: var(--faint-text);
		border-radius: var(--radius-base);
	}
	.beamer-column-chip:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-surface-500) 14%, transparent);
		color: var(--muted-text);
	}
</style>
