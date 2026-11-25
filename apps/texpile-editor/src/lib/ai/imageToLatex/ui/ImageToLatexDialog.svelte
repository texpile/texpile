<script lang="ts">
	// Convert to LaTeX: the picture with the part to read, what the AI service made of it, and Insert
	import { untrack } from 'svelte';
	import { LoaderCircle } from '@lucide/svelte';
	import Modal from '$lib/modals/Modal.svelte';
	import { m } from '$lib/paraglide/messages';
	import { ImageToLatexJob } from '../imageToLatexJob.svelte';
	import { imageToLatexRequest, type ImageToLatexRequest } from '../imageToLatexRequest';
	import PictureRegionPicker from './PictureRegionPicker.svelte';
	import AnswerPreviewView from './AnswerPreviewView.svelte';

	const props: { request: ImageToLatexRequest } = $props();
	const job = untrack(() => new ImageToLatexJob(props.request.target, props.request.picture));

	const title = $derived(job.target.dialect === 'typst' ? m.ai_image_convert_typst() : m.ai_image_convert_latex());
	const canConvert = $derived(job.phase === 'picking' || job.phase === 'done' || job.phase === 'failed');

	function close(): void {
		job.close();
		imageToLatexRequest.current = null;
	}

	function pick(region: typeof job.region): void {
		job.region = region;
	}

	function insert(): void {
		job.insert();
		imageToLatexRequest.current = null;
	}
</script>

<Modal {title} onClose={close} card="flex max-h-full w-full max-w-2xl flex-col gap-3 overflow-y-auto p-5">
	{#if job.url && job.size}
		<div class="flex flex-col items-center gap-1">
			<PictureRegionPicker url={job.url} size={job.size} region={job.region} onpick={pick} />
			<p class="text-muted text-xs">{m.ai_image_region_hint()}</p>
		</div>
	{/if}

	{#if job.phase === 'reading' || job.phase === 'fixing'}
		<div class="text-muted flex items-center gap-2 text-sm">
			<LoaderCircle class="size-4 shrink-0 animate-spin" />
			<span class="cap-center">
				{job.phase === 'reading' ? m.ai_image_running({ agent: job.agent }) : m.ai_image_fixing({ agent: job.agent })}
			</span>
		</div>
	{:else if job.phase === 'failed' && job.error}
		<p class="text-error-ink text-sm leading-relaxed [overflow-wrap:anywhere]">{job.error}</p>
	{:else if job.phase === 'done' && job.preview}
		<AnswerPreviewView preview={job.preview} />
		<pre
			class="bg-surface-100-900 rounded-base max-h-48 shrink-0 overflow-auto p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">{job.source}</pre>
	{/if}

	<div class="flex justify-end gap-2 pt-1">
		{#if canConvert}
			<button class="btn preset-tonal mr-auto" onclick={() => void job.convert()}>
				{job.region ? m.ai_image_convert_region() : m.ai_image_convert_all()}
			</button>
		{/if}
		<button class="btn preset-tonal" onclick={close}>{m.ai_image_cancel()}</button>
		<button class="btn preset-filled-primary-500" disabled={job.phase !== 'done' || !job.source} onclick={insert}
			>{m.ai_image_insert()}</button
		>
	</div>
</Modal>
