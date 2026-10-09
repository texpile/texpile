<script lang="ts">
	import { unavailableTip } from '$lib/components/tooltip.svelte';
	import { X, Languages } from '@lucide/svelte';
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import Modal from '../Modal.svelte';
	import { settings, updateSettings, type AppSettings } from '$lib/settings';
	import { setSpellcheckEnabled } from '$lib/editor/spellcheck/config/spellcheckConfig';
	import PrefsCollaborationPanel from './PrefsCollaborationPanel.svelte';
	import PrefsVersionControlPanel from './PrefsVersionControlPanel.svelte';
	import PrefsToolchainPanel from './PrefsToolchainPanel.svelte';
	import { changeUiLocale, keymapOptions, uiLocaleOptions } from './prefsOptions';
	import PrefsSpellingPanel from './spelling/PrefsSpellingPanel.svelte';
	import AppearanceMode from './AppearanceMode.svelte';
	import ThemePicker from './ThemePicker.svelte';
	import { preferencesTab } from '$lib/stores/dialogStore';
	import PrefsAiPanel from './PrefsAiPanel.svelte';
	import logoOnLight from '$branding/Logo-dark.svg';
	import logoOnDark from '$branding/Logo-light.svg';
	import { LogoSpin } from './logoSpin.svelte';
	import { m } from '$lib/paraglide/messages';
	import { windowGlass } from '$lib/chrome/windowGlass.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();
	const logoSpin = new LogoSpin();

	// One category on screen at a time, rather than every setting in one scroll. The list had grown
	// past the point where "wrap long lines" and "editor width" could be told apart at a glance -
	// which editor, and which of them, was only answerable by reading the hint under each.
	type Category = 'appearance' | 'editor' | 'proofing' | 'vcs' | 'collaboration' | 'toolchain' | 'integrations' | 'startup' | 'ai';
	let category = $state<Category>('appearance');
	// the browser guest has no local toolchain, no Zotero, no MCP server, no folder to reopen and no
	// copies or versions of its own: five tabs that could only ever report nothing, so they are
	// grayed there with why rather than left out
	const DESKTOP_ONLY_TABS: Category[] = ['vcs', 'toolchain', 'integrations', 'startup', 'ai'];
	function tabUnavailable(id: Category): boolean {
		return __WEB__ && DESKTOP_ONLY_TABS.includes(id);
	}
	const ALL_TABS: { id: Category; label: string }[] = [
		{ id: 'appearance', label: m.prefs_appearance() },
		// Editing, Source editor and Visual editor were three tabs holding three, two and two rows.
		// They were split so that "wrap long lines" and "editor width" could be told apart - which
		// editor, and which of them - and a heading inside one tab answers that just as well as a
		// sidebar entry did, without making the reader guess which of three tabs a setting is in.
		{ id: 'editor', label: m.prefs_group_editor() },
		// its own tab, as it was the bulk of Editor; named as the Spelling menu, which leads here
		{ id: 'proofing', label: m.prefs_group_proofing() },
		// Git's settings and Local History, in Git's and VS Code's words
		{ id: 'vcs', label: m.prefs_group_history() },
		{ id: 'collaboration', label: m.prefs_group_collaboration() },
		// LaTeX, Typst and Version control used to be three tabs. Every one of them was the same
		// thing - a list of external programs and whether they were found - so three sidebar entries
		// bought three clicks to answer one question ("is my machine set up"), and the two settings
		// that made LaTeX look like more than a probe list were duplicates of switches in the
		// compile-command dialog.
		{ id: 'toolchain', label: m.prefs_group_toolchain() },
		// external apps Texpile TALKS TO, as opposed to Toolchain's programs it runs. One row per
		// integration, each an on/off; whatever setup the app itself needs lives in its hint.
		{ id: 'integrations', label: m.prefs_group_integrations() },
		{ id: 'startup', label: m.prefs_group_startup() },
		{ id: 'ai', label: m.prefs_group_ai() }
	];
	const categories = ALL_TABS.filter((c) => !tabUnavailable(c.id));
	// the browser has no glass of its own; on the desktop it needs macOS or Windows 11 (windowGlass.ts)
	const glassUnavailable = $derived(windowGlass.works ? '' : __WEB__ ? m.unavailable_desktop() : m.prefs_window_transparency_unsupported());
	// Opened to answer a particular question (the compile modal's "your compiler is missing"): land
	// on that tab, then clear the request. Cleared only when it was SET, or the store write would
	// re-run this effect forever.
	$effect(() => {
		if (!open) return;
		const want = preferencesTab.current;
		if (!want) return;
		if (categories.some((c) => c.id === want)) category = want as Category;
		preferencesTab.current = null;
	});

	/** every row is the same shape: name and explanation on the left, the control on the right */
	const ROW = 'border-surface-200-800 flex items-start justify-between gap-6 border-b py-4 last:border-b-0';

	/**
	 * Rows that sit under a section heading, stepped in so they read as belonging to it.
	 *
	 * Padding on the LEFT only. The controls are right-aligned inside each row, so indenting both
	 * edges would walk the switches and selects inward per section and break the single column they
	 * currently form down the whole panel - the thing that makes the list scannable at all.
	 */
	const SUB = 'pl-4';
</script>

{#snippet label(text: string, hint: string, disabled = false, docs = '')}
	<div class="min-w-0">
		<div class="text-sm font-medium {disabled ? 'text-faint' : ''}">{text}</div>
		{#if hint}<p class="text-muted mt-1 text-xs leading-relaxed">
				{hint}
				{#if docs}<a class="anchor" href={docs} target="_blank" rel="noopener noreferrer">{m.prefs_how_to_set_up()}</a>{/if}
			</p>{/if}
	</div>
{/snippet}

<!-- The external programs Texpile's features depend on: one row each, saying only found / not found
     (the purpose sits in the tooltip). Anything more - versions, install commands - belongs in the
     docs, which the header links no matter what.
     One panel for all of them, grouped by what they serve. They were three sidebar tabs; a reader
     asking "is my machine set up" had to visit all three and could not see the answer at once. -->
{#snippet sectionHeading(text: string)}
	<h3 class="text-muted pt-4 pb-1 text-xs font-semibold tracking-wide uppercase">{text}</h3>
{/snippet}

{#snippet toggleRow(text: string, hint: string, checked: boolean, onChange: (v: boolean) => void, disabled = false, title = '', docs = '')}
	<!-- title is only ever the reason a row is grayed, so a click shows it as well as a hover -->
	<div class={ROW} use:unavailableTip={title}>
		{@render label(text, hint, disabled, docs)}
		<span class="flex" data-tip-anchor>
			<Switch {checked} {disabled} onCheckedChange={(d) => onChange(d.checked)}>
				<Switch.Control><Switch.Thumb /></Switch.Control>
				<Switch.HiddenInput />
			</Switch>
		</span>
	</div>
{/snippet}

{#snippet selectRow(
	text: string,
	hint: string,
	value: string | number,
	options: { value: string | number; label: string }[],
	onChange: (v: string) => void
)}
	<div class={ROW}>
		{@render label(text, hint)}
		<select class="select w-32 shrink-0 text-sm" {value} onchange={(e) => onChange((e.currentTarget as HTMLSelectElement).value)}>
			{#each options as o (o.value)}
				<option value={o.value}>{o.label}</option>
			{/each}
		</select>
	</div>
{/snippet}

<!-- overflow-clip, not hidden: a hidden box can still be scrolled by a script, and under the see-through window's
     sheet blur a switch that keeps focus while a setting changes scrolled the whole card off its content -->
<Modal bind:open card="flex h-[34rem] max-h-full max-w-3xl overflow-clip p-0">
	<!-- category list. Plain buttons rather than a tree: there is one level, and a disclosure
	     arrow on something that never expands is a promise the UI does not keep. -->
	<nav class="border-surface-300-700 bg-surface-100-900 w-44 shrink-0 overflow-y-auto border-r p-2">
		<!-- the column's top edge was dead space, and this is the one dialog with a column to
				     spare. Height matched to the category rows so it reads as a heading over them
				     rather than a banner. -->
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
		{#each ALL_TABS as c (c.id)}
			{#if tabUnavailable(c.id)}
				<!-- aria-disabled, not disabled: a disabled button takes no hover, and the hover is what says why -->
				<button
					class="rounded-base mb-0.5 block w-full cursor-default px-3 py-1.5 text-left text-sm opacity-50"
					aria-disabled="true"
					use:unavailableTip={m.unavailable_desktop()}
				>
					{c.label}
				</button>
			{:else}
				<button
					class="rounded-base mb-0.5 block w-full px-3 py-1.5 text-left text-sm {category === c.id
						? 'bg-primary-tint font-medium'
						: 'hover:preset-tonal'}"
					onclick={() => (category = c.id)}
				>
					{c.label}
				</button>
			{/if}
		{/each}
	</nav>

	<div class="flex min-w-0 flex-1 flex-col">
		<div class="border-surface-200-800 flex shrink-0 items-center justify-between gap-4 border-b px-5 py-3">
			<h2 class="text-base font-semibold">{categories.find((c) => c.id === category)?.label ?? m.prefs_title()}</h2>
			<button class="btn-icon btn-icon-xs hover:preset-tonal" aria-label={m.modal_close_aria()} onclick={() => (open = false)}
				><X class="size-4" /></button
			>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto px-5">
			{#if category === 'appearance'}
				<div class={ROW}>
					{@render label(m.prefs_mode(), m.prefs_appearance_hint())}
					<AppearanceMode />
				</div>
				<ThemePicker />
				{@render toggleRow(
					m.prefs_window_transparency(),
					'',
					windowGlass.works && settings.current.transparentWindow === true,
					(v) => updateSettings({ transparentWindow: v }),
					!!glassUnavailable,
					glassUnavailable
				)}
				<div class={ROW}>
					<!-- the one setting a user may need to find while the UI is in a language they
							     cannot read, so it carries an icon the others do not -->
					<div class="flex min-w-0 items-center gap-2">
						<Languages class="text-muted size-4 shrink-0" />
						{@render label(m.prefs_language(), '')}
					</div>
					<!-- sized by its widest label: a fixed width ran long language names under the native arrow -->
					<select class="select w-auto min-w-32 shrink-0 text-sm" value={settings.current.uiLocale} onchange={changeUiLocale}>
						{#each uiLocaleOptions() as l (l.value)}
							<option value={l.value}>{l.label}</option>
						{/each}
					</select>
				</div>
			{:else if category === 'editor'}
				<!-- the settings that belong to neither editor in particular lead, unheaded; the two
						     that are ABOUT one editor sit under its name below -->
				{@render toggleRow(m.prefs_comment_pill(), m.prefs_comment_pill_note(), settings.current.commentPill !== false, (v) =>
					updateSettings({ commentPill: v })
				)}
				{@render toggleRow(m.prefs_smart_paste(), m.prefs_smart_paste_note(), settings.current.smartPaste !== false, (v) =>
					updateSettings({ smartPaste: v })
				)}
				{@render selectRow(
					m.prefs_keybindings(),
					m.prefs_keybindings_note(),
					settings.current.editorKeymap ?? 'default',
					keymapOptions(),
					(v) => updateSettings({ editorKeymap: v as AppSettings['editorKeymap'] })
				)}
				{@render sectionHeading(m.prefs_group_source())}
				<div class={SUB}>
					{@render toggleRow(m.prefs_source_line_wrap(), m.prefs_source_line_wrap_note(), settings.current.sourceLineWrap !== false, (v) =>
						updateSettings({ sourceLineWrap: v })
					)}
					{@render toggleRow(m.prefs_math_preview(), m.prefs_math_preview_note(), settings.current.mathPreview !== false, (v) =>
						updateSettings({ mathPreview: v })
					)}
					{@render toggleRow(m.prefs_auto_snippets(), m.prefs_auto_snippets_note(), settings.current.autoSnippets !== false, (v) =>
						updateSettings({ autoSnippets: v })
					)}
				</div>
				{@render sectionHeading(m.prefs_group_visual())}
				<div class={SUB}>
					{@render toggleRow(m.prefs_visual_justify(), m.prefs_visual_justify_note(), settings.current.visualJustify !== false, (v) =>
						updateSettings({ visualJustify: v })
					)}
					<!-- only justified text is hyphenated, so the row is grayed with why while that is off -->
					{@render toggleRow(
						m.prefs_visual_hyphenate(),
						m.prefs_visual_hyphenate_note(),
						settings.current.visualHyphenate !== false,
						(v) => updateSettings({ visualHyphenate: v }),
						settings.current.visualJustify === false,
						settings.current.visualJustify === false ? m.prefs_visual_hyphenate_needs_justify() : ''
					)}
				</div>
			{:else if category === 'proofing'}
				<!-- all of it stays up with the switch off: the Spelling menu's Edit Dictionary leads here -->
				{@render toggleRow(m.prefs_spellcheck(), '', settings.current.spellcheck, (v) => setSpellcheckEnabled(v))}
				<PrefsSpellingPanel />
			{:else if category === 'vcs'}
				<PrefsVersionControlPanel />
			{:else if category === 'collaboration'}
				<PrefsCollaborationPanel />
			{:else if category === 'toolchain'}
				<!-- Nothing here is a preference; it is all "what did we find on this machine".
						     The switches that used to sit above the LaTeX list - live mode, the compile
						     completion marker - were second copies of switches in the compile-command dialog,
						     which is where you go to decide how this project builds. One control, one home.
						     Typst's preview switch was never duplicated here for the same reason. -->
				<PrefsToolchainPanel />
			{:else if category === 'integrations'}
				{@render toggleRow(
					m.prefs_zotero(),
					m.prefs_zotero_note(),
					settings.current.zoteroEnabled !== false,
					(v) => updateSettings({ zoteroEnabled: v }),
					false,
					'',
					'https://texpile.com/docs/integrations/zotero'
				)}
				{@render toggleRow(m.prefs_cite_doi(), m.prefs_cite_doi_note(), settings.current.citeByDoiEnabled !== false, (v) =>
					updateSettings({ citeByDoiEnabled: v })
				)}
			{:else if category === 'startup'}
				{@render toggleRow(m.prefs_reopen_last_folder(), '', settings.current.reopenLastFolder, (v) =>
					updateSettings({ reopenLastFolder: v })
				)}
				{@render toggleRow(m.prefs_check_updates(), '', settings.current.checkForUpdates, (v) => updateSettings({ checkForUpdates: v }))}
			{:else if category === 'ai'}
				<PrefsAiPanel />
			{/if}
		</div>
	</div>
</Modal>
