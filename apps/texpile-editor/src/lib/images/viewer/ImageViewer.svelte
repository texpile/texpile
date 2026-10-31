<script lang="ts">
	// an image file in its tab: a viewer first, zoomed and panned; with Edit on, each crop, turn, flip and width is
	// written over the file as it is made, the original kept
	import { m } from '$lib/paraglide/messages';
	import { untrack } from 'svelte';
	import { ImageViewport } from './imageViewport.svelte';
	import { ImageEditSession, isEditableImage } from '../edit/imageEditSession.svelte';
	import ImageViewerBar from './ImageViewerBar.svelte';
	import { versionedUrl } from './versionedUrl';
	import CropBox from '../crop/CropBox.svelte';
	import { wheelZoomFactor } from '$lib/preview/zoom/wheelZoom';
	import { confirmAsk } from '$lib/modals/confirm.svelte';
	import { basename } from '$lib/workspace/fileSystem';
	import { workspaceRoot } from '$lib/workspace/workspaceStore';
	import { ImageUsesWatch } from '../uses/imageUsesWatch.svelte';
	import { GUEST_ROOT } from '$lib/collab/sessionProvider';

	type Props = { path: string; url: string };
	const props: Props = $props();

	const view = new ImageViewport();
	const session = new ImageEditSession(() => props.path);
	const uses = new ImageUsesWatch(
		() => props.path,
		() => workspaceRoot.current
	);

	$effect(() => uses.watch());
	let editing = $state(false);
	// moved on after editing or a restore, so the file is read again
	let version = $state(0);
	let fileSize = $state({ w: 0, h: 0 });
	let stage = $state<HTMLDivElement>();
	let root = $state<HTMLDivElement>();
	let box = $state({ w: 0, h: 0 });

	const fileUrl = $derived(versionedUrl(props.url, version));
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

	function editKeys(e: KeyboardEvent): boolean {
		const mod = e.ctrlKey || e.metaKey;
		if (session.cropping && e.key === 'Enter') session.finishCrop();
		else if (session.cropping && e.key === 'Escape') session.cancelCrop();
		else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) session.undo();
		else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) session.redo();
		else return false;
		return true;
	}

	function windowKeys(e: KeyboardEvent): void {
		if (!editing || !root?.contains(document.activeElement)) return;
		if (!editKeys(e)) return;
		e.preventDefault();
		e.stopPropagation();
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
		if (session.cropping) session.finishCrop();
		await session.close();
		editing = false;
		version++;
		view.fit();
	}

	async function restore(): Promise<void> {
		const yes = await confirmAsk(m.image_restore_title(), {
			detail: m.image_restore_body({ name: basename(props.path) }),
			confirmLabel: m.image_restore_confirm()
		});
		if (!yes) return;
		await session.restoreOriginal();
		version++;
		await session.open(fileUrl);
	}
</script>

<svelte:window onkeydowncapture={windowKeys} />

<div bind:this={root} class="flex h-full min-h-0 flex-col">
	<ImageViewerBar
		{view}
		size={fileSize.w ? `${fileSize.w} × ${fileSize.h} px` : ''}
		unavailable={workspaceRoot.current === GUEST_ROOT ? m.unavailable_guest() : isEditableImage(props.path) ? null : m.image_edit_formats()}
		session={editing ? session : null}
		onedit={() => void toggleEdit()}
		onrestore={() => void restore()}
		uses={uses.uses}
		root={workspaceRoot.current ?? ''}
	/>
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
			<CropBox {rect} crop={session.draftCrop} onchange={(crop) => session.setCrop(crop)} />
		{/if}
	</div>
</div>

<style>
	.pixelated {
		image-rendering: pixelated;
	}
</style>
