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
	import { prefsFocus } from './search/prefsFocus.svelte';
	import { EDITOR_SUBS, PREFS_TABS, editorSubLabel, tabLabel, tabUnavailable, type PrefsTab } from './search/prefsTabs';

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
		if (available.some((t) => t.id === want)) navigation.tab = want as PrefsTab;
		preferencesTab.current = null;
	});

	function pick(tab: PrefsTab): void {
		if (navigation.searching && navigation.counts.has(tab)) navigation.showGroupOf(tab);
		else navigation.show(tab);
	}
</script>

<!-- overflow-clip, not hidden: a hidden box can still be scrolled by a script, and under the see-through window's
     sheet blur a switch that keeps focus while a setting changes scrolled the whole card off its content -->
<Modal bind:open card="flex h-[36rem] max-h-full max-w-3xl overflow-clip p-0">
	<nav class="border-surface-300-700 bg-surface-100-900 w-44 shrink-0 overflow-y-auto border-r p-2">
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
			<PrefsSidebarTab
				label={tab.label()}
				active={!navigation.searching && navigation.tab === tab.id && tab.id !== 'editor'}
				unavailable={tabUnavailable(tab)}
				matches={navigation.counts.get(tab.id)}
				dimmed={navigation.searching && !navigation.counts.has(tab.id)}
				onclick={() => pick(tab.id)}
			/>
			{#if tab.id === 'editor' && navigation.tab === 'editor' && !navigation.searching}
				{#each EDITOR_SUBS as sub (sub.id)}
					<PrefsSidebarSubTab
						label={sub.label()}
						active={prefsFocus.editorSub === sub.id}
						onclick={() => navigation.showEditorSub(sub.id)}
					/>
				{/each}
			{/if}
		{/each}
	</nav>

	<div class="flex min-w-0 flex-1 flex-col">
		<div class="border-surface-200-800 flex shrink-0 items-center justify-between gap-4 border-b px-5 py-3">
			<h2 class="text-base font-semibold">
				{navigation.searching
					? m.prefs_title()
					: navigation.tab === 'editor'
						? `${tabLabel('editor')} › ${editorSubLabel(prefsFocus.editorSub)}`
						: tabLabel(navigation.tab)}
			</h2>
			<button class="btn-icon btn-icon-xs hover:preset-tonal" aria-label={m.modal_close_aria()} onclick={() => (open = false)}
				><X class="size-4" /></button
			>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto px-5" bind:this={navigation.scroller}>
			{#if navigation.searching}
				<PrefsSearchResults {navigation} />
			{:else if navigation.tab === 'appearance'}
				<PrefsAppearancePanel />
			{:else if navigation.tab === 'editor'}
				<PrefsEditorPanel />
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
