<script lang="ts">
	import { X } from '@lucide/svelte';
	import Modal from '../Modal.svelte';
	import { preferencesTab } from '$lib/stores/dialogStore';
	import logoOnLight from '$branding/Logo-dark.svg';
	import logoOnDark from '$branding/Logo-light.svg';
	import { LogoSpin } from './logoSpin.svelte';
	import { m } from '$lib/paraglide/messages';
	import PrefsAppearancePanel from './appearance/PrefsAppearancePanel.svelte';
	import PrefsEditorPanel from './editor/PrefsEditorPanel.svelte';
	import PrefsTypstPanel from './editor/PrefsTypstPanel.svelte';
	import PrefsLatexChecks from './checks/PrefsLatexChecks.svelte';
	import PrefsSnippetsPanel from './snippets/PrefsSnippetsPanel.svelte';
	import PrefsSpellingPanel from './spelling/PrefsSpellingPanel.svelte';
	import PrefsVersionControlPanel from './PrefsVersionControlPanel.svelte';
	import PrefsCollaborationPanel from './PrefsCollaborationPanel.svelte';
	import PrefsToolchainPanel from './PrefsToolchainPanel.svelte';
	import PrefsIntegrationsPanel from './integrations/PrefsIntegrationsPanel.svelte';
	import PrefsStartupPanel from './startup/PrefsStartupPanel.svelte';
	import PrefsAiPanel from './PrefsAiPanel.svelte';
	import { PrefsNavigation } from './search/prefsNavigation.svelte';
	import PrefsSearchField from './search/PrefsSearchField.svelte';
	import PrefsSearchResults from './search/PrefsSearchResults.svelte';
	import PrefsSidebarTab from './search/PrefsSidebarTab.svelte';
	import PrefsSidebarSubTab from './search/PrefsSidebarSubTab.svelte';
	import { sectionLabel, sectionShown } from './search/prefsRows';
	import { PREFS_TABS, tabLabel, tabUnavailable, type PrefsTab } from './search/prefsTabs';

	let { open = $bindable(false) }: { open?: boolean } = $props();
	const logoSpin = new LogoSpin();
	const navigation = new PrefsNavigation();

	const available = PREFS_TABS.filter((t) => !tabUnavailable(t));

	// Opened to answer a particular question (the compile modal's "your compiler is missing"): land
	// on that tab, then clear the request. Cleared only when it was SET, or the store write would
	// re-run this effect forever.
	$effect(() => {
		if (!open) {
			navigation.query = '';
			return;
		}
		const want = preferencesTab.current;
		if (!want) return;
		if (available.some((t) => t.id === want)) void navigation.show(want as PrefsTab);
		preferencesTab.current = null;
	});

	function pick(tab: PrefsTab): void {
		if (navigation.searching && navigation.counts.has(tab)) navigation.showGroupOf(tab);
		else void navigation.show(tab);
	}
</script>

<!-- overflow-clip, not hidden: a hidden box can still be scrolled by a script, and under the see-through window's
     sheet blur a switch that keeps focus while a setting changes scrolled the whole card off its content -->
<Modal bind:open card="flex h-[36rem] max-h-full max-w-3xl overflow-clip p-0">
	<nav class="border-surface-300-700 bg-surface-100-900 w-52 shrink-0 overflow-y-auto border-r p-2">
		<div class="mb-2 px-3 pt-2 pb-3">
			<button
				type="button"
				class="block h-6 cursor-default select-none"
				style:transform="rotate({logoSpin.angle}deg)"
				onclick={logoSpin.kick}
				aria-label="Texpile"
			>
				<img src={logoOnLight} alt="" class="h-6 w-auto dark:hidden" />
				<img src={logoOnDark} alt="" class="hidden h-6 w-auto dark:block" />
			</button>
		</div>
		<PrefsSearchField {navigation} />
		{#each PREFS_TABS as tab (tab.id)}
			{@const current = !navigation.searching && navigation.tab === tab.id}
			{@const sections = (tab.sections ?? []).filter((id) => sectionShown(tab.id, id))}
			{@const expanded = navigation.expanded.includes(tab.id) && !navigation.searching}
			<PrefsSidebarTab
				label={tab.label()}
				{current}
				active={current && navigation.section === null}
				expanded={sections.length && !tabUnavailable(tab) ? expanded : undefined}
				unavailable={tabUnavailable(tab)}
				matches={navigation.counts.get(tab.id)}
				dimmed={navigation.searching && !navigation.counts.has(tab.id)}
				onclick={() => pick(tab.id)}
				ontoggle={() => navigation.toggle(tab.id)}
			/>
			{#if expanded}
				{#each sections as section (section)}
					<PrefsSidebarSubTab
						label={sectionLabel(section)}
						active={current && navigation.section === section}
						onclick={() => void navigation.showSection(tab.id, section)}
					/>
				{/each}
			{/if}
		{/each}
	</nav>

	<div class="flex min-w-0 flex-1 flex-col">
		<div class="border-surface-200-800 flex shrink-0 items-center justify-between gap-4 border-b px-5 py-3">
			<h2 class="text-base font-semibold">
				{navigation.searching ? m.prefs_title() : tabLabel(navigation.tab)}
			</h2>
			<button class="btn-icon btn-icon-xs hover:preset-tonal" aria-label={m.modal_close_aria()} onclick={() => (open = false)}
				><X class="size-4" /></button
			>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto px-5" bind:this={navigation.scroller} onscroll={() => navigation.trackSection()}>
			{#if navigation.searching}
				<PrefsSearchResults {navigation} />
			{:else if navigation.tab === 'appearance'}
				<PrefsAppearancePanel />
			{:else if navigation.tab === 'editor'}
				<PrefsEditorPanel />
			{:else if navigation.tab === 'latex'}
				<PrefsLatexChecks />
			{:else if navigation.tab === 'typst'}
				<PrefsTypstPanel />
			{:else if navigation.tab === 'snippets'}
				<PrefsSnippetsPanel />
			{:else if navigation.tab === 'proofing'}
				<PrefsSpellingPanel />
			{:else if navigation.tab === 'vcs'}
				<PrefsVersionControlPanel />
			{:else if navigation.tab === 'collaboration'}
				<PrefsCollaborationPanel />
			{:else if navigation.tab === 'toolchain'}
				<PrefsToolchainPanel />
			{:else if navigation.tab === 'integrations'}
				<PrefsIntegrationsPanel />
			{:else if navigation.tab === 'startup'}
				<PrefsStartupPanel />
			{:else if navigation.tab === 'ai'}
				<PrefsAiPanel />
			{/if}
		</div>
	</div>
</Modal>
