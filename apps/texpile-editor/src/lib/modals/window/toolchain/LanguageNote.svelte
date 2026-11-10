<script lang="ts">
	import { toolchainProbe } from '../toolchainProbe.svelte';
	import { problemText, programWithVersion, type LanguageNote } from './toolchainRows';
	import { m } from '$lib/paraglide/messages';

	const props: { note: LanguageNote | null; docs: string; open: boolean; onToggle: () => void } = $props();
	const note = $derived(props.note);
</script>

{#if note}
	<p class="text-muted mt-1 text-xs leading-relaxed">
		{#if note.kind === 'checking'}
			{m.prefs_toolchain_checking()}
		{:else if note.kind === 'missing'}
			{m.prefs_toolchain_not_found()}
			<a class="anchor" href={props.docs} target="_blank" rel="noopener noreferrer">{m.prefs_toolchain_how_to_install()}</a>
		{:else if note.kind === 'single' && note.row.probe?.found && !note.row.probe.broken}
			{m.prefs_toolchain_program_works({ program: programWithVersion(note.row.tool.name, note.row.probe.detail) })}
		{:else if note.kind === 'single'}
			<span class="text-warning-ink">{problemText(note.row.probe)}</span>
			<button type="button" class="anchor" onclick={() => void toolchainProbe.run()} disabled={toolchainProbe.probing}>
				{m.prefs_toolchain_recheck()}
			</button>
		{:else}
			{note.working === note.total
				? m.prefs_toolchain_all_work({ count: String(note.total) })
				: m.prefs_toolchain_some_work({ working: String(note.working), total: String(note.total) })}
			<button type="button" class="anchor" aria-expanded={props.open} onclick={props.onToggle}>
				{props.open ? m.prefs_toolchain_hide() : m.prefs_toolchain_show()}
			</button>
		{/if}
	</p>
{/if}
