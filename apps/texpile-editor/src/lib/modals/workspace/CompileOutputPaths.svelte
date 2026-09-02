<script lang="ts">
	// The compile modal's "Advanced: output paths" disclosure. Both lanes have these - a command
	// that writes somewhere unusual has to be told where, whichever compiler it runs - so this is
	// shared rather than duplicated into each lane.
	import { tip } from '$lib/components/tooltip.svelte';
	import { ChevronDown } from '@lucide/svelte';
	import * as cc from '$lib/workspace/compileCommand';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		outputs: { pdf: string; log: string };
		open: boolean;
	};
	let { outputs = $bindable(), open = $bindable() }: Props = $props();

	function pathWarning(v: string, ext: '.pdf' | '.log'): string | null {
		const issue = cc.outputPathIssue(v, ext);
		if (issue === 'has-token') return m.wsview_warning_no_main_here({ token: '{main}' });
		if (issue === 'wrong-ext') return m.wsview_warning_should_end_in({ ext });
		return null;
	}
	const pdfPathWarning = $derived(pathWarning(outputs.pdf, '.pdf'));
	const logPathWarning = $derived(pathWarning(outputs.log, '.log'));
</script>

<button
	type="button"
	class="text-surface-500 hover:text-surface-950-50 mt-4 inline-flex items-center gap-1 text-xs"
	onclick={() => (open = !open)}
>
	<ChevronDown class="size-3.5 transition-transform {open ? '' : '-rotate-90'}" />
	{m.wsview_advanced_output_paths()}
</button>
{#if open}
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
					class="btn btn-xs hover:preset-tonal shrink-0"
					onclick={() => (outputs.pdf = '')}
					disabled={!outputs.pdf}
					use:tip={m.wsview_clear_autodetect_title()}
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
					class="btn btn-xs hover:preset-tonal shrink-0"
					onclick={() => (outputs.log = '')}
					disabled={!outputs.log}
					use:tip={m.wsview_clear_autodetect_title()}
				>
					{m.wsview_auto_button()}
				</button>
			</div>
		</div>
	</div>
{/if}
