<script lang="ts">
	import { X } from '@lucide/svelte';
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { themeChoice, setTheme, type ThemeChoice } from '$lib/theme';
	import { settings, updateSettings } from '$lib/settings';
	import { setSpellcheckEnabled } from '$lib/editor/extensions/spellcheck/spellcheckConfig';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const themes: { value: ThemeChoice; label: string }[] = [
		{ value: 'system', label: 'System' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	];

	// image resize snaps to multiples of this fraction of \textwidth
	const resizeSteps: { value: number; label: string }[] = [
		{ value: 0.1, label: '10%' },
		{ value: 0.25, label: '25%' },
		{ value: 0.5, label: '50%' }
	];
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
		<div class="card bg-surface-50-950 border-surface-300-700 w-full max-w-md border p-5 shadow-2xl">
			<div class="mb-4 flex items-center justify-between gap-4">
				<h2 class="text-base font-semibold">Preferences</h2>
				<button class="btn-icon btn-icon-sm hover:preset-tonal" aria-label="Close" onclick={() => (open = false)}
					><X class="size-4" /></button
				>
			</div>

			<div class="space-y-5">
				<div>
					<div class="text-surface-600-400 mb-1.5 text-sm font-medium">Appearance</div>
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
					<p class="text-surface-500 mt-1.5 text-xs">System follows your operating system's light or dark setting.</p>
				</div>

				<div>
					{@render toggle(
						'Autosave',
						$settings.draftMode || $settings.autosave,
						(v) => updateSettings({ autosave: v }),
						$settings.draftMode,
						$settings.draftMode ? 'Live mode requires autosave' : ''
					)}
					<p class="text-surface-500 mt-1 text-xs">
						{#if $settings.draftMode}
							Live mode keeps this on so the live preview always reflects your saved file.
						{:else}
							When off, changes save only when you press Save, and you're warned before switching files.
						{/if}
					</p>
				</div>
				{@render toggle('Reopen last folder on launch', $settings.reopenLastFolder, (v) => updateSettings({ reopenLastFolder: v }))}
				{@render toggle('Check for updates on launch', $settings.checkForUpdates, (v) => updateSettings({ checkForUpdates: v }))}
				{@render toggle('Spell check', $settings.spellcheck, (v) => setSpellcheckEnabled(v))}
				<div>
					{@render toggle('Math preview', $settings.mathPreview !== false, (v) => updateSettings({ mathPreview: v }))}
					<p class="text-surface-500 mt-1 text-xs">Live typeset preview of the math under the cursor in source mode.</p>
				</div>
				<div>
					{@render toggle('Dark PDF pages in dark mode', $settings.pdfDarkPages, (v) => updateSettings({ pdfDarkPages: v }))}
					<p class="text-surface-500 mt-1 text-xs">When off, the PDF preview keeps the original page colors even in dark mode.</p>
				</div>

				<div>
					<div class="flex items-center justify-between gap-4">
						<span class="text-sm">Image resize step</span>
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
					<p class="text-surface-500 mt-1 text-xs">Dragging an image snaps its width to multiples of this fraction of the text width.</p>
				</div>
			</div>
		</div>
	</div>
{/if}
