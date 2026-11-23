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
