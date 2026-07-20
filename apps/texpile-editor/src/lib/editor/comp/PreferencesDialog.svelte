<script lang="ts">
	import { X } from '@lucide/svelte';
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { themeChoice, setTheme, type ThemeChoice } from '$lib/theme';
	import { settings, updateSettings, applyUiLocale, type AppSettings } from '$lib/settings';
	import { setSpellcheckEnabled } from '$lib/editor/extensions/spellcheck/spellcheckConfig';
	import { collabHost } from '$lib/collab/hostStore.svelte';
	import { m } from '$lib/paraglide/messages';

	// autosave is forced on (shown disabled) while live mode or a hosted session is active
	const autosaveForced = $derived($settings.draftMode || collabHost.active);
	import { LOCALE_META } from '$lib/localeMeta';
	import { toaster } from '$lib/modals/toaster-svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const themes: { value: ThemeChoice; label: string }[] = [
		{ value: 'system', label: m.prefs_theme_system() },
		{ value: 'light', label: m.prefs_theme_light() },
		{ value: 'dark', label: m.prefs_theme_dark() }
	];

	// image resize snaps to multiples of this fraction of \textwidth
	const resizeSteps: { value: number; label: string }[] = [
		{ value: 0.1, label: '10%' },
		{ value: 0.25, label: '25%' },
		{ value: 0.5, label: '50%' }
	];

	// <option> only renders plain text, so the machine-translated tag is appended into the label itself
	const uiLocales: { value: AppSettings['uiLocale']; label: string }[] = (
		Object.entries(LOCALE_META) as [AppSettings['uiLocale'], (typeof LOCALE_META)[AppSettings['uiLocale']]][]
	).map(([value, meta]) => ({
		value,
		label: meta.machineTranslated ? `${meta.label} ${m.prefs_machine_translated_tag({}, { locale: value })}` : meta.label
	}));

	function onLocaleChange(e: Event) {
		const uiLocale = (e.currentTarget as HTMLSelectElement).value as AppSettings['uiLocale'];
		updateSettings({ uiLocale });
		if (!LOCALE_META[uiLocale]?.machineTranslated) {
			applyUiLocale(uiLocale);
			return;
		}
		// warn every time (not just once) since switching to this language is a deliberate, infrequent action
		toaster.warning({
			title: m.mt_warning_title(),
			description: m.mt_warning_description(),
			duration: 6000,
			action: {
				label: m.mt_warning_report_action(),
				onClick: () => {
					const title = `Translation issue: ${LOCALE_META[uiLocale]?.label ?? uiLocale}`;
					window.open(`https://github.com/texpile/texpile/issues/new?title=${encodeURIComponent(title)}`, '_blank', 'noopener,noreferrer');
				}
			}
		});
		// give the toast a moment on screen before the locale-switch reload would otherwise wipe it
		setTimeout(() => applyUiLocale(uiLocale), 3000);
	}
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && (open = false)} />

{#snippet toggle(label: string, checked: boolean, onChange: (v: boolean) => void, disabled = false, hint = '')}
	<div class="flex items-center justify-between gap-4" title={hint}>
		<span class="text-sm {disabled ? 'text-surface-400' : ''}">{label}</span>
		<Switch {checked} {disabled} onCheckedChange={(d) => onChange(d.checked)}>
			<Switch.Control><Switch.Thumb /></Switch.Control>
			<Switch.HiddenInput />
		</Switch>
	</div>
{/snippet}

{#if open}
	<div
		class="fixed inset-0 z-1300 flex items-center justify-center bg-black/40 p-4"
		role="presentation"
		onmousedown={(e) => e.target === e.currentTarget && (open = false)}
	>
		<div class="card bg-surface-50-950 border-surface-300-700 flex max-h-full w-full max-w-md flex-col border p-5 shadow-2xl">
			<div class="mb-4 flex items-center justify-between gap-4">
				<h2 class="text-base font-semibold">{m.prefs_title()}</h2>
				<button class="btn-icon btn-icon-sm hover:preset-tonal" aria-label={m.prefs_close_aria()} onclick={() => (open = false)}
					><X class="size-4" /></button
				>
			</div>

			<div class="min-h-0 space-y-5 overflow-y-auto">
				<div>
					<div class="text-surface-600-400 mb-1.5 text-sm font-medium">{m.prefs_appearance()}</div>
					<div class="bg-surface-200-800 rounded-base flex gap-1 p-0.5">
						{#each themes as t (t.value)}
							<button
								class="rounded-base flex-1 px-3 py-1 text-sm {$themeChoice === t.value
									? 'bg-surface-50-950 font-medium shadow-sm'
									: 'text-surface-600-400 hover:text-surface-950-50'}"
								onclick={() => setTheme(t.value)}
							>
								{t.label}
							</button>
						{/each}
					</div>
					<p class="text-surface-500 mt-1.5 text-xs">{m.prefs_appearance_hint()}</p>
				</div>

				<div>
					<div class="flex items-center justify-between gap-4">
						<span class="text-sm">{m.prefs_language()}</span>
						<select class="select w-32 text-sm" value={$settings.uiLocale} onchange={onLocaleChange}>
							{#each uiLocales as l (l.value)}
								<option value={l.value}>{l.label}</option>
							{/each}
						</select>
					</div>
				</div>

				<div>
					{@render toggle(
						m.prefs_autosave(),
						autosaveForced || $settings.autosave,
						(v) => updateSettings({ autosave: v }),
						autosaveForced,
						autosaveForced ? m.prefs_autosave_hint_forced() : ''
					)}
					<p class="text-surface-500 mt-1 text-xs">
						{#if collabHost.active}
							{m.prefs_autosave_note_session()}
						{:else if $settings.draftMode}
							{m.prefs_autosave_note_live()}
						{:else}
							{m.prefs_autosave_note_off()}
						{/if}
					</p>
				</div>
				{@render toggle(m.prefs_reopen_last_folder(), $settings.reopenLastFolder, (v) => updateSettings({ reopenLastFolder: v }))}
				{@render toggle(m.prefs_check_updates(), $settings.checkForUpdates, (v) => updateSettings({ checkForUpdates: v }))}
				{@render toggle(m.prefs_spellcheck(), $settings.spellcheck, (v) => setSpellcheckEnabled(v))}
				<div>
					{@render toggle(m.prefs_math_preview(), $settings.mathPreview !== false, (v) => updateSettings({ mathPreview: v }))}
					<p class="text-surface-500 mt-1 text-xs">{m.prefs_math_preview_note()}</p>
				</div>
				<div>
					{@render toggle(m.prefs_dark_pdf_pages(), $settings.pdfDarkPages, (v) => updateSettings({ pdfDarkPages: v }))}
					<p class="text-surface-500 mt-1 text-xs">{m.prefs_dark_pdf_pages_note()}</p>
				</div>

				<div>
					<div class="flex items-center justify-between gap-4">
						<span class="text-sm">{m.prefs_image_resize_step()}</span>
						<select
							class="select w-24 text-sm"
							value={$settings.figureResizeStep}
							onchange={(e) => updateSettings({ figureResizeStep: Number((e.currentTarget as HTMLSelectElement).value) })}
						>
							{#each resizeSteps as s (s.value)}
								<option value={s.value}>{s.label}</option>
							{/each}
						</select>
					</div>
					<p class="text-surface-500 mt-1 text-xs">{m.prefs_image_resize_step_note()}</p>
				</div>
			</div>
		</div>
	</div>
{/if}
