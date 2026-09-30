<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { distros } from './distros.svelte';
	import { toolDirs } from './toolDirs.svelte';
	import { m } from '$lib/paraglide/messages';

	const props: { family: ToolDistro['family'] } = $props();
	const family = $derived(props.family);
	const active = $derived(distros.active(family));
	const onPath = $derived(distros.onPath(family));
	// with no folder picked, tinymist runs from PATH, else Texpile's own copy (resolveTinymist)
	const managed = $derived(distros.list(family).find((d) => d.managed) ?? null);
	const fallback = $derived(onPath ?? managed);
	// the copy the empty pick runs is that option, not an entry of its own
	const others = $derived(distros.list(family).filter((d) => !d.onPath && d.dir !== fallback?.dir));
	const shown = $derived(active ?? fallback);
	const value = $derived(active && active.dir !== fallback?.dir ? active.dir : '');
	const fallbackLabel = $derived(
		onPath
			? m.prefs_toolchain_distro_path({ name: onPath.name })
			: managed
				? m.prefs_toolchain_distro_managed({ name: managed.name })
				: m.prefs_toolchain_distro_path_none()
	);
</script>

<!-- shown for a known install even when none is listed or on PATH: picking it lists its folder -->
{#if shown || others.length > 0}
	<div class="border-surface-200-800 flex items-start justify-between gap-6 border-b py-4">
		<div class="min-w-0">
			<div class="text-sm font-medium">{m.prefs_toolchain_distro()}</div>
			{#if shown}
				<p class="text-muted mt-1 truncate font-mono text-xs leading-relaxed" use:tip={shown.detail}>{shown.dir}</p>
			{/if}
		</div>
		<!-- rebuilt with the folder list, or a pick that changes nothing keeps showing what was clicked -->
		{#key toolDirs.rows}
			<select
				class="select w-auto shrink-0 text-sm"
				{value}
				disabled={toolDirs.busy}
				onchange={(e) => void distros.choose(family, e.currentTarget.value || null)}
			>
				{#each others as d (d.dir)}
					<option value={d.dir}>{d.managed ? m.prefs_toolchain_distro_managed({ name: d.name }) : d.name}</option>
				{/each}
				<option value="">{fallbackLabel}</option>
			</select>
		{/key}
	</div>
{/if}
