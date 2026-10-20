<script lang="ts">
	// one row under Completion, since few people write package files; Manage shows the lists
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import { snippetDocsUrl } from '$lib/editor/snippets/file/snippetFiles';
	import { snippetStatus } from '$lib/editor/snippets/file/snippetStatus.svelte';
	import { isDesktop } from '$lib/workspace/fileSystem';
	import { workspaceRoot } from '$lib/workspace/workspaceStore';
	import { prefsFocus } from '../search/prefsFocus.svelte';
	import PrefsRow from '../rows/PrefsRow.svelte';
	import PrefsPackageList from './PrefsPackageList.svelte';
	import PrefsPackageNew from './PrefsPackageNew.svelte';
	import { m } from '$lib/paraglide/messages';

	const counts = $derived(
		[
			workspaceRoot.current ? m.prefs_packages_in_folder({ count: snippetStatus.files.packages.project.length }) : '',
			isDesktop() ? m.prefs_packages_in_every_folder({ count: snippetStatus.files.packages.global.length }) : ''
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<PrefsRow id="package-files" layout="block">
	{#snippet children(def)}
		<div class="flex items-start justify-between gap-6">
			<div class="min-w-0">
				<div class="text-sm font-medium">{def.label()}</div>
				<p class="text-muted mt-1 text-xs leading-relaxed">
					{def.note?.()}
					<a class="anchor" href={snippetDocsUrl('package')} target="_blank" rel="noopener noreferrer">{m.prefs_packages_docs()}</a>
				</p>
				{#if counts}<p class="text-muted mt-1 text-xs">{counts}</p>{/if}
			</div>
			<button
				type="button"
				class="btn btn-sm preset-tonal shrink-0 gap-1"
				aria-expanded={prefsFocus.packagesOpen}
				onclick={() => (prefsFocus.packagesOpen = !prefsFocus.packagesOpen)}
			>
				<span class="cap-center">{m.prefs_packages_manage()}</span>
				<IconChevronDown size={14} class="transition-transform {prefsFocus.packagesOpen ? 'rotate-180' : ''}" />
			</button>
		</div>
		{#if prefsFocus.packagesOpen}
			<div class="mt-2 pl-4">
				{#if isDesktop()}
					<PrefsPackageList layer="global" />
				{/if}
				{#if workspaceRoot.current}
					<PrefsPackageList layer="project" />
					<PrefsPackageNew />
				{/if}
			</div>
		{/if}
	{/snippet}
</PrefsRow>
