<script lang="ts">
	// what the editor area shows for a file it cannot open as text
	import { CircleAlert, FileWarning } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		loadError: string | null;
		binaryWarning: { path: string; size: number } | null;
		onOpenAsText?: (path: string) => void;
	};
	const props: Props = $props();
</script>

{#if props.loadError}
	<div class="text-error-ink mx-auto mt-12 flex max-w-md flex-col items-center gap-2 text-center">
		<CircleAlert class="size-8" />
		<p class="text-sm">{props.loadError}</p>
	</div>
{:else if props.binaryWarning}
	{@const path = props.binaryWarning.path}
	<div class="text-muted mx-auto mt-12 flex max-w-md flex-col items-center gap-3 text-center">
		<FileWarning class="size-8" />
		<p class="text-sm">{m.wsview_binary_warning_body()}</p>
		<button type="button" class="btn btn-sm preset-tonal" onclick={() => props.onOpenAsText?.(path)}>
			{m.wsview_binary_open_anyway()}
		</button>
	</div>
{/if}
