<script lang="ts">
	// The hidden file input behind Insert > Image. Mounted outside the nav so it survives on
	// macOS, where the menu bar itself is native and the nav is not rendered.
	import { editorViewStore } from '$lib/stores/editorStore';
	import { startImageUpload } from '$lib/editor/visual/extensions/image';
	import { createLocalImageSettings } from '$lib/editor/visual/extensions/image/imageplugin.svelte';
	import { m } from '$lib/paraglide/messages';

	let { imageDir }: { imageDir?: string } = $props();

	let input: HTMLInputElement;

	export function pick(): void {
		if (imageDir) input?.click();
	}

	function onPicked(e: Event) {
		const el = e.target as HTMLInputElement;
		const file = el.files?.[0];
		el.value = '';
		const v = editorViewStore.current;
		if (!file || !imageDir || !v) return;
		startImageUpload(
			v,
			file,
			m.menubar_image_alt_default(),
			createLocalImageSettings(() => imageDir ?? ''),
			v.state.schema
		);
		v.focus();
	}
</script>

<input bind:this={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="hidden" onchange={onPicked} />
