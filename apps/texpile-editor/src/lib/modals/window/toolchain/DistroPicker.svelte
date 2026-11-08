<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import MenuDropdown from '$lib/menus/MenuDropdown.svelte';
	import { distros } from '../distros.svelte';
	import { toolDirs } from '../toolDirs.svelte';
	import { distroGroups, distroInUse, distroLabel, folderFor, INSTALL_VALUE, type InstallOffer } from './toolchainRows';

	const props: { family: ToolDistro['family']; label: string; offer: InstallOffer | null; onInstall: () => void } = $props();
	const list = $derived(distros.list(props.family));
	const inUse = $derived(distroInUse(list, distros.active(props.family)));

	function pick(value: string): void {
		if (value === INSTALL_VALUE) props.onInstall();
		else void distros.choose(props.family, folderFor(list, value));
	}
</script>

<div class="flex items-center justify-between gap-6 py-2">
	<span class="text-sm font-medium">{props.label}</span>
	<MenuDropdown groups={distroGroups(list, inUse, props.offer)} placement="bottom-end" onSelect={pick}>
		{#snippet trigger(attrs)}
			<button
				{...attrs}
				class="btn preset-outlined-surface-200-800 bg-surface-50-950 hover:preset-tonal min-w-72 justify-between gap-2 text-sm"
				disabled={toolDirs.busy}
			>
				<span class="cap-center truncate">{distroLabel(inUse)}</span>
				<ChevronDown class="text-muted size-4 shrink-0" />
			</button>
		{/snippet}
	</MenuDropdown>
</div>
