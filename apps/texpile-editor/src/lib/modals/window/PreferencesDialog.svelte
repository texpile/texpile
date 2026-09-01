<script lang="ts">
	import { X, Languages } from '@lucide/svelte';
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import Modal from '../Modal.svelte';
	import { themeChoice, setTheme } from '$lib/theme';
	import { settings, updateSettings, updateSettingsLive, setMcpEnabled, type AppSettings } from '$lib/settings';
	import { layout, updateLayout } from '$lib/storage/layout';
	import { compileConfig } from '$lib/workspace/projectConfigSync.svelte';
	import { setSpellcheckEnabled } from '$lib/editor/spellcheck/spellcheckConfig';
	import { collabHost } from '$lib/collab/hostStore.svelte';
	import PrefsToolchainPanel from './PrefsToolchainPanel.svelte';
	import { changeUiLocale, keymapOptions, resizeStepOptions, themeOptions, uiLocaleOptions } from './prefsOptions';
	import { preferencesTab } from '$lib/stores/dialogStore';
	import McpSetupModal from './McpSetupModal.svelte';
	// dark wordmark for light backgrounds, white one for dark mode - the pair StartView uses
	import logoOnLight from '$branding/Logo-dark.svg';
	import logoOnDark from '$branding/Logo-light.svg';
	import { m } from '$lib/paraglide/messages';

	// autosave is forced on (shown disabled) while live mode or a hosted session is active
	const autosaveForced = $derived(compileConfig.current.latex.liveMode || collabHost.active);

	let { open = $bindable(false) }: { open?: boolean } = $props();

	// MCP
	type McpStatus = {
		running: boolean;
		port: number | null;
		error: string | null;
	};
	let mcp = $state<McpStatus | null>(null);

	function nativeMcp() {
		return (window as unknown as { texpileNative?: { mcpStatus?: () => Promise<McpStatus> } }).texpileNative;
	}

	async function refreshMcp() {
		mcp = (await nativeMcp()?.mcpStatus?.()) ?? null;
	}
	// the port only exists once main has actually bound, so read it back after the flip
	async function onMcpToggle(v: boolean) {
		await setMcpEnabled(v);
		await refreshMcp();
	}
	// re-read whenever the dialog opens: another window may have toggled it, or the port may have
	// been taken since the last look
	$effect(() => {
		if (open) void refreshMcp();
	});

	/** the instructions modal, stacked above this dialog */
	let setupOpen = $state(false);

	// One category on screen at a time, rather than every setting in one scroll. The list had grown
	// past the point where "wrap long lines" and "editor width" could be told apart at a glance -
	// which editor, and which of them, was only answerable by reading the hint under each.
	type Category = 'appearance' | 'editor' | 'toolchain' | 'integrations' | 'startup' | 'ai';
	let category = $state<Category>('appearance');
	// the browser guest has no local toolchain, no Zotero, no MCP server and no folder to reopen:
	// four tabs that could only ever report nothing
	const DESKTOP_ONLY_TABS: Category[] = ['toolchain', 'integrations', 'startup', 'ai'];
	const ALL_TABS: { id: Category; label: string }[] = [
		{ id: 'appearance', label: m.prefs_appearance() },
		// Editing, Source editor and Visual editor were three tabs holding three, two and two rows.
		// They were split so that "wrap long lines" and "editor width" could be told apart - which
		// editor, and which of them - and a heading inside one tab answers that just as well as a
		// sidebar entry did, without making the reader guess which of three tabs a setting is in.
		{ id: 'editor', label: m.prefs_group_editor() },
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
	const categories = ALL_TABS.filter((c) => !__WEB__ || !DESKTOP_ONLY_TABS.includes(c.id));

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

{#snippet label(text: string, hint: string, disabled = false)}
	<div class="min-w-0">
		<div class="text-sm font-medium {disabled ? 'text-surface-400' : ''}">{text}</div>
		{#if hint}<p class="text-surface-500 mt-1 text-xs leading-relaxed">{hint}</p>{/if}
	</div>
{/snippet}

<!-- The external programs Texpile's features depend on: one row each, saying only found / not found
     (the purpose sits in the tooltip). Anything more - versions, install commands - belongs in the
     docs, which the header links no matter what.
     One panel for all of them, grouped by what they serve. They were three sidebar tabs; a reader
     asking "is my machine set up" had to visit all three and could not see the answer at once. -->
{#snippet sectionHeading(text: string)}
	<h3 class="text-surface-600-300 pt-4 pb-1 text-xs font-semibold tracking-wide uppercase">{text}</h3>
{/snippet}

{#snippet toggleRow(text: string, hint: string, checked: boolean, onChange: (v: boolean) => void, disabled = false, title = '')}
	<div class={ROW} {title}>
		{@render label(text, hint, disabled)}
		<Switch {checked} {disabled} onCheckedChange={(d) => onChange(d.checked)}>
			<Switch.Control><Switch.Thumb /></Switch.Control>
			<Switch.HiddenInput />
		</Switch>
	</div>
{/snippet}

{#snippet selectRow(
	text: string,
	hint: string,
	value: string | number,
	options: { value: string | number; label: string }[],
	onChange: (v: string) => void,
	width = 'w-32'
)}
	<div class={ROW}>
		{@render label(text, hint)}
		<select class="select {width} shrink-0 text-sm" {value} onchange={(e) => onChange((e.currentTarget as HTMLSelectElement).value)}>
			{#each options as o (o.value)}
				<option value={o.value}>{o.label}</option>
			{/each}
		</select>
	</div>
{/snippet}

<Modal bind:open card="flex h-[34rem] max-h-full max-w-3xl overflow-hidden p-0">
	<!-- category list. Plain buttons rather than a tree: there is one level, and a disclosure
	     arrow on something that never expands is a promise the UI does not keep. -->
	<nav class="border-surface-300-700 bg-surface-100-900 w-44 shrink-0 overflow-y-auto border-r p-2">
		<!-- the column's top edge was dead space, and this is the one dialog with a column to
				     spare. Height matched to the category rows so it reads as a heading over them
				     rather than a banner. -->
		<div class="mb-2 px-3 pt-2 pb-3">
			<img src={logoOnLight} alt="Texpile" class="h-6 w-auto dark:hidden" />
			<img src={logoOnDark} alt="Texpile" class="hidden h-6 w-auto dark:block" />
		</div>
		{#each categories as c (c.id)}
			<button
				class="mb-0.5 block w-full rounded px-3 py-1.5 text-left text-sm {category === c.id
					? 'bg-primary-500/15 text-primary-700 dark:text-primary-300 font-medium'
					: 'hover:bg-surface-200-800'}"
				onclick={() => (category = c.id)}
			>
				{c.label}
			</button>
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
					{@render label(m.prefs_theme(), m.prefs_appearance_hint())}
					<div class="bg-surface-200-800 rounded-base flex shrink-0 gap-1 p-0.5">
						{#each themeOptions() as t (t.value)}
							<button
								class="rounded-base px-3 py-1 text-sm {themeChoice.current === t.value
									? 'bg-surface-50-950 font-medium shadow-sm'
									: 'text-surface-600-400 hover:text-surface-950-50'}"
								onclick={() => setTheme(t.value)}
							>
								{t.label}
							</button>
						{/each}
					</div>
				</div>
				<div class={ROW}>
					<!-- the one setting a user may need to find while the UI is in a language they
							     cannot read, so it carries an icon the others do not -->
					<div class="flex min-w-0 items-center gap-2">
						<Languages class="text-surface-500 size-4 shrink-0" />
						{@render label(m.prefs_language(), '')}
					</div>
					<select class="select w-32 shrink-0 text-sm" value={settings.current.uiLocale} onchange={changeUiLocale}>
						{#each uiLocaleOptions() as l (l.value)}
							<option value={l.value}>{l.label}</option>
						{/each}
					</select>
				</div>
				<!-- the whole of what a "PDF preview" tab held: one switch, and one about how the
						     document LOOKS, which is the question this tab already answers -->
				{@render toggleRow(m.prefs_dark_pdf_pages(), m.prefs_dark_pdf_pages_note(), layout.current.pdfDarkPages, (v) =>
					updateLayout({ pdfDarkPages: v })
				)}
			{:else if category === 'editor'}
				<!-- the settings that belong to neither editor in particular lead, unheaded; the two
						     that are ABOUT one editor sit under its name below -->
				{@render toggleRow(
					m.prefs_autosave(),
					collabHost.active
						? m.prefs_autosave_note_session()
						: compileConfig.current.latex.liveMode
							? m.prefs_autosave_note_live()
							: m.prefs_autosave_note_off(),
					autosaveForced || settings.current.autosave,
					(v) => updateSettings({ autosave: v }),
					autosaveForced,
					autosaveForced ? m.prefs_autosave_hint_forced() : ''
				)}
				{@render toggleRow(m.prefs_spellcheck(), '', settings.current.spellcheck, (v) => setSpellcheckEnabled(v))}
				{@render toggleRow(m.prefs_comment_pill(), m.prefs_comment_pill_note(), settings.current.commentPill !== false, (v) =>
					updateSettings({ commentPill: v })
				)}
				<!-- off silences BOTH compile-time dock opens - the terminal on start and Problems on
						     errors (a chronically-erroring LaTeX doc that still builds would have the dock
						     stolen every run). The badge beside Compile stays as the passive signal. -->
				{@render toggleRow(
					m.prefs_open_dock_on_compile(),
					m.prefs_open_dock_on_compile_note(),
					settings.current.openDockOnCompile !== false,
					(v) => updateSettings({ openDockOnCompile: v })
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
				</div>
				{@render sectionHeading(m.prefs_group_visual())}
				<div class={SUB}>
					<div class={ROW}>
						{@render label(m.prefs_visual_width(), m.prefs_visual_width_note())}
						<div class="w-48 shrink-0">
							<div class="text-surface-500 mb-1 text-right text-xs tabular-nums">{settings.current.visualMaxWidth ?? 768}px</div>
							<!-- oninput, not onchange: a width slider is only useful if the column moves under
									     the cursor. updateSettingsLive applies each value, writing only the settled one. -->
							<input
								class="w-full accent-current"
								type="range"
								min="560"
								max="1600"
								step="16"
								value={settings.current.visualMaxWidth ?? 768}
								oninput={(e) => updateSettingsLive({ visualMaxWidth: Number((e.currentTarget as HTMLInputElement).value) })}
								aria-label={m.prefs_visual_width()}
							/>
						</div>
					</div>
					{@render selectRow(
						m.prefs_image_resize_step(),
						m.prefs_image_resize_step_note(),
						settings.current.figureResizeStep,
						resizeStepOptions(),
						(v) => updateSettings({ figureResizeStep: Number(v) }),
						'w-24'
					)}
				</div>
			{:else if category === 'toolchain'}
				<!-- Nothing here is a preference; it is all "what did we find on this machine".
						     The switches that used to sit above the LaTeX list - live mode, the compile
						     completion marker - were second copies of switches in the compile-command dialog,
						     which is where you go to decide how this project builds. One control, one home.
						     Typst's preview switch was never duplicated here for the same reason. -->
				<PrefsToolchainPanel />
			{:else if category === 'integrations'}
				{@render toggleRow(m.prefs_zotero(), m.prefs_zotero_note(), settings.current.zoteroEnabled !== false, (v) =>
					updateSettings({ zoteroEnabled: v })
				)}
			{:else if category === 'startup'}
				{@render toggleRow(m.prefs_reopen_last_folder(), '', settings.current.reopenLastFolder, (v) =>
					updateSettings({ reopenLastFolder: v })
				)}
				{@render toggleRow(m.prefs_check_updates(), '', settings.current.checkForUpdates, (v) => updateSettings({ checkForUpdates: v }))}
			{:else if category === 'ai'}
				<div class={ROW}>
					<!-- persisted through the main process, not updateSettings: flipping this also has to
							     start or stop the loopback server, and main owns it -->
					{@render label(m.prefs_mcp(), m.prefs_mcp_note())}
					<Switch checked={settings.current.mcpEnabled === true} onCheckedChange={(d) => void onMcpToggle(d.checked)}>
						<Switch.Control><Switch.Thumb /></Switch.Control>
						<Switch.HiddenInput />
					</Switch>
				</div>
				{#if settings.current.mcpEnabled === true && mcp}
					<div class="border-surface-200-800 flex items-center justify-between gap-3 border-b py-3">
						{#if mcp.running && mcp.port}
							<span class="text-surface-500 text-xs">{m.prefs_mcp_status({ addr: `127.0.0.1:${mcp.port}` })}</span>
							<!-- the command lives in its own modal: it is long, and read once -->
							<button class="btn btn-xs preset-tonal shrink-0 text-xs" onclick={() => (setupOpen = true)}>{m.prefs_mcp_show()}</button>
						{:else}
							<span class="text-error-600 text-xs">{m.prefs_mcp_error({ error: mcp.error ?? '' })}</span>
						{/if}
					</div>
					<!-- A SECOND permission, listed under the first because it is meaningless without it,
							     but deliberately not implied by it: everything else this server exposes reads
							     state or moves the window, while a compile command is a shell command line. -->
					{@render toggleRow(
						m.prefs_mcp_compile_command(),
						m.prefs_mcp_compile_command_note(),
						settings.current.mcpAllowCompileCommand === true,
						(v) => updateSettings({ mcpAllowCompileCommand: v })
					)}
				{/if}
			{/if}
		</div>
	</div>
</Modal>

{#if open}
	<!-- only while Preferences is open, so closing Preferences takes the instructions with it -->
	<McpSetupModal bind:open={setupOpen} port={mcp?.port ?? null} />
{/if}
