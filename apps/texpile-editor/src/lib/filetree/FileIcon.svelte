<script lang="ts">
	// File-tree icon. The glyphs are vendored from Material Icon Theme in their own colours
	// (see assets/fileicons/NOTICE.md); fileIconMap picks one per filename. `cls` carries the
	// size, and its text colour is inert here - every icon paints its own fill.
	//
	// Those fills are desaturated at render time rather than in the assets. Baking a single flat
	// tone into them (an earlier attempt) destroyed each icon's INTERNAL contrast, so dense marks
	// read heavier than sparse ones; a luminance desaturation keeps every tone's relative value,
	// so multi-tone glyphs like the bibliography's book spines stay legible. Dropping the class
	// restores full colour, which is what makes this a one-line switch if it ever becomes a
	// preference.
	//
	// Brightness is per-theme because desaturating lands everything mid-grey, which is too dim
	// on a dark surface and too washed out on a light one: darker in light mode, lifted in dark.
	import { fileIconSvg, folderIconSvg } from './fileIconMap';

	type Props = {
		/** file name (or path); the extension picks the icon. ignored when `folder` is set */
		name: string;
		/** render the folder glyph instead of matching on the name; 'open' when the row is expanded */
		folder?: 'closed' | 'open' | null;
		class?: string;
	};
	let { name, folder = null, class: cls = '' }: Props = $props();
	const svg = $derived(folder ? folderIconSvg(folder === 'open') : fileIconSvg(name));
</script>

<!-- eslint-disable svelte/no-at-html-tags -- build-time bundled svg assets, never user content -->
<span class="{cls} inline-flex items-center justify-center brightness-75 grayscale dark:brightness-150" role="img" aria-label={name}>
	{@html svg}
</span>
