<script lang="ts">
	// The compile-command modal: live-mode switch, engine/latexmk quick setup, the shell command,
	// and the advanced per-folder output-path overrides. Persisting is the caller's job.
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { X, Play, ChevronDown } from '@lucide/svelte';
	import * as cc from '$lib/workspace/compileCommand';
	import { mainFile } from '$lib/workspace/workspaceStore';
	import { settings, updateSettings, DEFAULT_COMPILE_COMMAND } from '$lib/settings';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		open: boolean;
		command: string;
		outputs: { pdf: string; log: string };
		advancedOpen: boolean;
		onSave: (thenRun: boolean) => void;
		onUseDefault: () => void;
		onRun: () => void;
	}
	let {
		open = $bindable(),
		command = $bindable(),
		outputs = $bindable(),
		advancedOpen = $bindable(),
		onSave,
		onUseDefault,
		onRun
	}: Props = $props();

	// quick-setup chip highlight state, reflected live from the draft (null engine = unrecognized)
	const engine = $derived(cc.detectEngine(command));
	const latexmk = $derived(cc.usesLatexmk(command));

	function applyEngine(e: cc.Engine) {
		command = cc.buildCompileCommand(e, cc.usesLatexmk(command), command);
	}
	function applyLatexmk(on: boolean) {
		command = cc.buildCompileCommand(cc.detectEngine(command) ?? 'pdflatex', on, command);
	}
	function pathWarning(v: string, ext: '.pdf' | '.log'): string | null {
		const issue = cc.outputPathIssue(v, ext);
		if (issue === 'has-token') return m.wsview_warning_no_main_here({ token: '{main}' });
		if (issue === 'wrong-ext') return m.wsview_warning_should_end_in({ ext });
		return null;
	}
	const pdfPathWarning = $derived(pathWarning(outputs.pdf, '.pdf'));
	const logPathWarning = $derived(pathWarning(outputs.log, '.log'));
</script>

{#if open}
	<div
		class="fixed inset-0 z-1300 flex items-center justify-center bg-black/40 p-4"
		role="presentation"
		onmousedown={(e) => e.target === e.currentTarget && (open = false)}
	>
		<div class="card bg-surface-50-950 border-surface-300-700 w-full max-w-lg border p-5 shadow-2xl">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-base font-semibold">{m.wsview_compile_modal_title()}</h2>
				<button class="btn-icon btn-icon-sm hover:preset-tonal" onclick={() => (open = false)} aria-label={m.wsview_close_aria()}>
					<X class="size-4" />
				</button>
			</div>
			<!-- (main-file selection lives in the first-compile confirm modal and the file
			     tree's "Set as main file" - not here; this modal is only about the command) -->

			<!-- Live mode has its own lualatex pipeline; when on, the shell command is inert -->
			<div class="mb-1 flex items-center justify-between gap-4">
				<span class="text-sm">{m.wsview_live_mode_label()} <span class="text-surface-500">{m.wsview_experimental_label()}</span></span>
				<Switch checked={$settings.draftMode} onCheckedChange={(d) => updateSettings({ draftMode: d.checked })}>
					<Switch.Control><Switch.Thumb /></Switch.Control>
					<Switch.HiddenInput />
				</Switch>
			</div>

			{#if $settings.draftMode}
				<p class="text-surface-500 mt-1 mb-1 text-xs">
					{m.wsview_livemode_desc_pre()} <strong>lualatex</strong>
					{m.wsview_livemode_desc_post()}
				</p>
				<div class="border-surface-300-700 text-surface-500 mt-3 rounded border border-dashed px-3 py-2 text-xs">
					{m.wsview_compile_disabled_live()}
					<code class="bg-surface-200-800 ml-1 rounded px-1 opacity-70">lualatex (built-in)</code>
				</div>
			{:else}
				<p class="text-surface-600-300 mt-2 mb-3 text-sm">
					{m.wsview_compile_desc_pre()} <code class="bg-surface-200-800 rounded px-1">{'{main}'}</code>
					{m.wsview_compile_desc_post()}
				</p>

				<!-- quick setup: chips reflect the command when recognizable, and regenerate it on click -->
				<div class="mb-2 flex flex-wrap items-center gap-2 text-sm">
					<span class="text-surface-500 text-xs">{m.wsview_engine_label()}</span>
					{#each ['pdflatex', 'lualatex', 'xelatex'] as const as eng (eng)}
						<button
							type="button"
							class="rounded-base border px-2 py-0.5 text-xs {engine === eng
								? 'border-primary-500 bg-primary-500/10 text-primary-600-400 font-medium'
								: 'border-surface-300-700 text-surface-600-300 hover:preset-tonal'}"
							onclick={() => applyEngine(eng)}
						>
							{eng}
						</button>
					{/each}
					{#if engine === null && command.trim()}
						<span class="text-surface-400 text-xs italic">{m.wsview_custom_label()}</span>
					{/if}
					<label class="text-surface-600-300 ml-auto inline-flex items-center gap-1.5 text-xs">
						<input type="checkbox" class="checkbox" checked={latexmk} onchange={(e) => applyLatexmk(e.currentTarget.checked)} />
						{m.wsview_use_latexmk_label()}
					</label>
				</div>

				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="input w-full font-mono text-sm"
					bind:value={command}
					placeholder={DEFAULT_COMPILE_COMMAND}
					spellcheck="false"
					autofocus
					onkeydown={(e) => {
						if (e.key === 'Enter' && !(command.includes('{main}') && !$mainFile)) onSave(true);
						else if (e.key === 'Escape') open = false;
					}}
				/>
				<div class="mt-4 flex items-center justify-between gap-4">
					<span class="text-sm">{m.wsview_completion_marker_label()}</span>
					<Switch checked={$settings.compileSentinel} onCheckedChange={(d) => updateSettings({ compileSentinel: d.checked })}>
						<Switch.Control><Switch.Thumb /></Switch.Control>
						<Switch.HiddenInput />
					</Switch>
				</div>
				<p class="text-surface-500 mt-1 text-xs">
					{m.wsview_completion_marker_desc()}
				</p>
			{/if}

			{#if !$settings.draftMode}
				<button
					type="button"
					class="text-surface-500 hover:text-surface-950-50 mt-4 inline-flex items-center gap-1 text-xs"
					onclick={() => (advancedOpen = !advancedOpen)}
				>
					<ChevronDown class="size-3.5 transition-transform {advancedOpen ? '' : '-rotate-90'}" />
					{m.wsview_advanced_output_paths()}
				</button>
				{#if advancedOpen}
					<div class="mt-2 space-y-3">
						<p class="text-surface-500 text-xs">
							{m.wsview_advanced_desc_pre()}
							<code class="bg-surface-200-800 rounded px-1">-jobname</code>
							{m.wsview_advanced_desc_post()}
						</p>
						<div>
							<div class="mb-1 flex items-center justify-between gap-2">
								<span class="text-surface-600-300 text-xs font-medium">{m.wsview_pdf_file_label()}</span>
								{#if pdfPathWarning}<span class="text-warning-600-400 text-xs">{pdfPathWarning}</span>{/if}
							</div>
							<div class="flex gap-2">
								<input
									class="input flex-1 font-mono text-sm"
									bind:value={outputs.pdf}
									placeholder={m.wsview_auto_detected_placeholder()}
									spellcheck="false"
								/>
								<button
									type="button"
									class="btn btn-sm hover:preset-tonal shrink-0"
									onclick={() => (outputs.pdf = '')}
									disabled={!outputs.pdf}
									title={m.wsview_clear_autodetect_title()}
								>
									{m.wsview_auto_button()}
								</button>
							</div>
						</div>
						<div>
							<div class="mb-1 flex items-center justify-between gap-2">
								<span class="text-surface-600-300 text-xs font-medium">{m.wsview_log_file_label()}</span>
								{#if logPathWarning}<span class="text-warning-600-400 text-xs">{logPathWarning}</span>{/if}
							</div>
							<div class="flex gap-2">
								<input
									class="input flex-1 font-mono text-sm"
									bind:value={outputs.log}
									placeholder={m.wsview_auto_detected_placeholder()}
									spellcheck="false"
								/>
								<button
									type="button"
									class="btn btn-sm hover:preset-tonal shrink-0"
									onclick={() => (outputs.log = '')}
									disabled={!outputs.log}
									title={m.wsview_clear_autodetect_title()}
								>
									{m.wsview_auto_button()}
								</button>
							</div>
						</div>
					</div>
				{/if}
			{/if}

			<div class="mt-4 flex items-center justify-between gap-3">
				<span class="text-surface-500 text-xs">
					{#if !$mainFile}{m.wsview_pick_main_file_to_run()}{/if}
				</span>
				<div class="flex gap-2">
					<button class="btn btn-sm hover:preset-tonal" onclick={() => (open = false)}>{m.wsview_cancel_label()}</button>
					{#if $settings.draftMode}
						<button
							class="btn btn-sm preset-filled-primary-500 gap-1.5"
							onclick={() => {
								open = false;
								onRun();
							}}
							disabled={!$mainFile}
						>
							<Play class="size-4" />
							{m.wsview_run_preview()}
						</button>
					{:else}
						<button class="btn btn-sm hover:preset-tonal" onclick={() => onSave(false)}>{m.wsview_save_label()}</button>
						<button
							class="btn btn-sm preset-tonal-primary gap-1.5"
							onclick={onUseDefault}
							disabled={DEFAULT_COMPILE_COMMAND.includes('{main}') && !$mainFile}
							title={m.wsview_use_default_title()}
						>
							<Play class="size-4" />
							{m.wsview_use_default()}
						</button>
						<button
							class="btn btn-sm preset-filled-primary-500 gap-1.5"
							onclick={() => onSave(true)}
							disabled={command.includes('{main}') && !$mainFile}
						>
							<Play class="size-4" />
							{m.wsview_save_and_run()}
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
