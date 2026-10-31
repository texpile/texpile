<script lang="ts">
	// an image file in its tab: a viewer first, zoomed and panned; with Edit on, its crop, turn, flip and width are
	// saved over the file, the original kept
	import { untrack } from 'svelte';
	import { ImageViewport } from './imageViewport.svelte';
	import { ImageEditSession, isEditableImage } from '../edit/imageEditSession.svelte';
	import ImageViewerBar from './ImageViewerBar.svelte';
	import ImageEditBar from '../edit/ImageEditBar.svelte';
	import CropBox from '../crop/CropBox.svelte';
	import { wheelZoomFactor } from '$lib/preview/zoom/wheelZoom';
	import { confirmAsk } from '$lib/modals/confirm.svelte';
	import { basename } from '$lib/workspace/fileSystem';

	type Props = { path: string; url: string };
	const props: Props = $props();

	const view = new ImageViewport();
	const session = new ImageEditSession(() => props.path);
	let editing = $state(false);
	// moved on after a save or a restore, so the file is read again
	let version = $state(0);
	let fileSize = $state({ w: 0, h: 0 });
	let stage = $state<HTMLDivElement>();
	let box = $state({ w: 0, h: 0 });

	const fileUrl = $derived(`${props.url}${props.url.includes('?') ? '&' : '?'}v=${version}`);
	const shown = $derived(editing && session.preview ? session.preview : fileUrl);
	const rect = $derived({ x: view.x, y: view.y, w: view.natural.w * view.scale, h: view.natural.h * view.scale });

	$effect(() => {
		const { w, h } = box;
		untrack(() => view.setBox(w, h));
	});

	function loaded(e: Event): void {
		const image = e.currentTarget as HTMLImageElement;
		view.setNatural(image.naturalWidth, image.naturalHeight);
		if (!editing) fileSize = { w: image.naturalWidth, h: image.naturalHeight };
	}

	function pointAt(e: MouseEvent): { x: number; y: number } {
		const r = stage!.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	}

	function wheel(e: WheelEvent): void {
		e.preventDefault();
		if (e.ctrlKey || e.metaKey) view.zoomTo(view.scale * wheelZoomFactor(e), pointAt(e));
		else view.pan(-e.deltaX, -e.deltaY);
	}

	function drag(e: PointerEvent): void {
		if (e.button !== 0) return;
		stage!.setPointerCapture(e.pointerId);
		let last = { x: e.clientX, y: e.clientY };
		function move(m: PointerEvent): void {
			view.pan(m.clientX - last.x, m.clientY - last.y);
			last = { x: m.clientX, y: m.clientY };
		}
		function end(): void {
			stage!.removeEventListener('pointermove', move);
			stage!.removeEventListener('pointerup', end);
		}
		stage!.addEventListener('pointermove', move);
		stage!.addEventListener('pointerup', end);
	}

	function keys(e: KeyboardEvent): void {
		if (e.key === '+' || e.key === '=') view.zoomIn();
		else if (e.key === '-') view.zoomOut();
		else if (e.key === '0') view.fit();
		else if (e.key === '1') view.zoomTo(1);
		else return;
		e.preventDefault();
	}

	async function toggleEdit(): Promise<void> {
		if (!editing) {
			editing = true;
			await session.open(fileUrl);
			return;
		}
		if (session.dirty && !(await confirmAsk('Discard the changes to this image?', { confirmLabel: 'Discard' }))) return;
		session.close();
		editing = false;
		view.fit();
	}

	async function save(): Promise<void> {
		await session.save();
		session.close();
		editing = false;
		version++;
		view.fit();
	}

	async function restore(): Promise<void> {
		const yes = await confirmAsk('Restore the original image?', {
			detail: `${basename(props.path)} goes back to how it was before its first edit in Texpile.`,
			confirmLabel: 'Restore'
		});
		if (!yes) return;
		await session.restoreOriginal();
		version++;
		await session.open(fileUrl);
	}
</script>

<div class="flex h-full min-h-0 flex-col">
	<ImageViewerBar
		{view}
		size={fileSize.w ? `${fileSize.w} × ${fileSize.h} px` : ''}
		{editing}
		editable={isEditableImage(props.path)}
		onedit={() => void toggleEdit()}
	/>
	{#if editing}
		<ImageEditBar {session} onsave={() => void save()} oncancel={() => void toggleEdit()} onrestore={() => void restore()} />
	{/if}
	<div
		bind:this={stage}
		bind:clientWidth={box.w}
		bind:clientHeight={box.h}
		class="bg-surface-100-900 relative min-h-0 flex-1 cursor-grab overflow-hidden outline-none active:cursor-grabbing"
		role="application"
		aria-label={basename(props.path)}
		tabindex="0"
		onwheel={wheel}
		onpointerdown={drag}
		ondblclick={(e) => (view.fitted ? view.zoomTo(1, pointAt(e)) : view.fit())}
		onkeydown={keys}
	>
		<img
			src={shown}
			alt=""
			draggable="false"
			onload={loaded}
			class="pointer-events-none absolute top-0 left-0 max-w-none origin-top-left select-none"
			class:pixelated={view.scale > 2}
			style:width="{view.natural.w}px"
			style:height="{view.natural.h}px"
			style:transform="translate({view.x}px, {view.y}px) scale({view.scale})"
		/>
		{#if editing && session.cropping && rect.w > 0}
			<CropBox {rect} crop={session.edits.crop} onchange={(crop) => session.setCrop(crop)} />
		{/if}
	</div>
</div>

<style>
	.pixelated {
		image-rendering: pixelated;
	}
</style>
