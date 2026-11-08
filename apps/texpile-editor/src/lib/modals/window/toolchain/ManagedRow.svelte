<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import type { LanguageInstall } from './languageInstalls';

	const props: { install: LanguageInstall } = $props();
	const installed = $derived(props.install.installed);
</script>

{#if installed && !props.install.step}
	<div class="flex items-center gap-2 py-1.5">
		<span class="cap-center text-muted min-w-0 flex-1 truncate pl-6 text-sm" use:tip={installed.path}>{installed.text}</span>
		<button type="button" class="btn btn-sm preset-tonal shrink-0" onclick={() => props.install.remove()} disabled={props.install.busy}>
			{props.install.removeLabel}
		</button>
	</div>
{/if}
