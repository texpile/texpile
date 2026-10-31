<script lang="ts">
	// the image tab's edits, shown while Edit is on: crop, turn, flip and a width to shrink to, then save or let go
	import { Crop, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import PreviewToolbar from '$lib/preview/PreviewToolbar.svelte';
	import type { ImageEditSession } from './imageEditSession.svelte';

	type Props = { session: ImageEditSession; onsave: () => void; oncancel: () => void; onrestore: () => void };
	const props: Props = $props();

	function setWidth(e: Event): void {
		const value = Number((e.target as HTMLInputElement).value);
		props.session.setWidth(value > 0 ? value : null);
	}
</script>

{#snippet tools()}
	<button aria-pressed={props.session.cropping} onclick={() => props.session.toggleCrop()} aria-label="Crop" use:tip={'Crop'}>
		<Crop size={16} />
	</button>
	<button onclick={() => props.session.turn('left')} aria-label="Turn left" use:tip={'Turn left'}><RotateCcw size={16} /></button>
	<button onclick={() => props.session.turn('right')} aria-label="Turn right" use:tip={'Turn right'}><RotateCw size={16} /></button>
	<button onclick={() => props.session.flip('x')} aria-label="Flip horizontally" use:tip={'Flip horizontally'}>
		<FlipHorizontal2 size={16} />
	</button>
	<button onclick={() => props.session.flip('y')} aria-label="Flip vertically" use:tip={'Flip vertically'}>
		<FlipVertical2 size={16} />
	</button>
{/snippet}

{#snippet width()}
	<input
		type="number"
		class="page-input"
		min="1"
		value={props.session.output.w}
		onchange={setWidth}
		aria-label="Width in pixels"
		use:tip={'Width in pixels'}
		style:--digits={String(props.session.output.w).length}
	/>
	<span class="text-muted text-xs tabular-nums">× {props.session.output.h} px</span>
{/snippet}

{#snippet finish()}
	{#if props.session.originalAt !== null}
		<button class="wide" onclick={props.onrestore} use:tip={'Put back the image as it was before its first edit in Texpile'}
			>Restore original</button
		>
	{/if}
	<button class="wide" disabled={!props.session.dirty} onclick={() => props.session.reset()}>Reset</button>
	<button class="wide" onclick={props.oncancel}>Cancel</button>
	<span>
		<button
			type="button"
			class="btn btn-sm preset-filled-primary-500"
			disabled={!props.session.dirty || props.session.saving}
			onclick={props.onsave}>Save</button
		>
	</span>
{/snippet}

<PreviewToolbar
	inEditor
	dividers={false}
	groups={[
		{ id: 'tools', render: tools },
		{ id: 'width', render: width },
		{ id: 'finish', pinned: true, alignEnd: true, render: finish }
	]}
/>
