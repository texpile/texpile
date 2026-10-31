<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { CircleAlert, Scan, X } from '@lucide/svelte';
	import type { FigureEditorState } from '../../state/editorState.svelte';
	import CanvasNotice from './CanvasNotice.svelte';
	import { naturalSizeText } from './canvasNoticeTexts';
	import EngineLog from './EngineLog.svelte';
	import DrawingProgress from './DrawingProgress.svelte';
	import EngineLoading from './EngineLoading.svelte';
	import { messageParts } from '../../ui/messageParts';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	const natural = $derived(naturalSizeText(props.editor));
</script>

<EngineLog editor={props.editor} />

{#if !props.editor.render.drawing}
	<div class="text-muted absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center text-sm">
		{#if props.editor.render.failure}
			<span class="text-error-ink">{props.editor.render.failure}</span>
		{:else}
			<EngineLoading engineName={props.editor.language.engineName} />
		{/if}
	</div>
{/if}

{#if props.editor.check.refused}
	<CanvasNotice error>
		<CircleAlert class="size-3.5 shrink-0" />
		<span class="cap-center truncate"
			>{m.figure_notice_refused({ engine: props.editor.language.engineName, error: props.editor.check.refused })}</span
		>
		<button
			class="btn-icon btn-icon-sm hover:preset-tonal"
			aria-label={m.figure_notice_dismiss()}
			onclick={() => (props.editor.check.refused = null)}
		>
			<X class="size-3.5" />
		</button>
	</CanvasNotice>
{:else if props.editor.check.declined}
	<CanvasNotice>
		<CircleAlert class="text-muted size-3.5 shrink-0" />
		<span class="cap-center truncate">{props.editor.check.declined}</span>
		<button
			class="btn-icon btn-icon-sm hover:preset-tonal"
			aria-label={m.figure_notice_dismiss()}
			onclick={() => (props.editor.check.declined = null)}
		>
			<X class="size-3.5" />
		</button>
	</CanvasNotice>
{:else if props.editor.unclosed}
	{@const u = props.editor.unclosed}
	<CanvasNotice error class="pr-3">
		<CircleAlert class="size-3.5 shrink-0" />
		<span class="cap-center"
			>{#each messageParts( m.figure_notice_unclosed( { open: '{open}', close: '{close}', line: u.line } ), ['open', 'close'] ) as part, k (k)}{#if 'slot' in part}<code
						>{part.slot === 'open' ? u.open : u.close}</code
					>{:else}{part.text}{/if}{/each}</span
		>
	</CanvasNotice>
{:else if props.editor.pictureIsNew}
	<CanvasNotice class="pr-3">
		<Scan class="text-muted size-3.5 shrink-0" />
		<span class="cap-center">{m.figure_notice_no_picture()}</span>
	</CanvasNotice>
{:else if props.editor.pictureIsCommand}
	<CanvasNotice class="pr-3">
		<Scan class="text-muted size-3.5 shrink-0" />
		<span class="cap-center"
			>{#each messageParts(m.figure_notice_command({ command: '{command}' }), ['command']) as part, k (k)}{#if 'slot' in part}<code
						>\tikz</code
					>{:else}{part.text}{/if}{/each}</span
		>
	</CanvasNotice>
{:else if natural}
	<CanvasNotice>
		<Scan class="text-muted size-3.5 shrink-0" />
		<span class="cap-center"
			>{m.figure_notice_natural()} <b>{natural}</b><span class="text-muted">{m.figure_notice_natural_note()}</span></span
		>
		{#if !props.editor.picture?.layout}
			<button class="btn btn-xs preset-outlined-surface-200-800 hover:preset-tonal" onclick={() => props.editor.setFrame()}
				>{m.figure_notice_set_size()}</button
			>
		{/if}
	</CanvasNotice>
{/if}

{#if props.editor.render.drawing}
	<DrawingProgress busy={props.editor.render.busy} engineName={props.editor.language.engineName} />
{/if}
