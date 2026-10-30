<script lang="ts">
	import type { LibraryElement } from '../figure/figureLanguage';
	import { ELEMENT_DRAG_TYPE } from './libraryCommands';

	type Props = { element: LibraryElement; onpick: () => void; ondragging: (on: boolean) => void };
	const props: Props = $props();
</script>

<button
	class="group flex min-w-0 flex-col gap-1 text-left"
	draggable="true"
	ondragstart={(e) => {
		e.dataTransfer?.setData(ELEMENT_DRAG_TYPE, props.element.id);
		// after the browser has taken its picture of the tile
		setTimeout(() => props.ondragging(true));
	}}
	ondragend={() => props.ondragging(false)}
	onclick={props.onpick}
>
	<!-- the drawing is paper in either theme -->
	<span
		class="border-surface-200-800 group-hover:border-primary-500 rounded-base flex h-16 items-center justify-center overflow-hidden border bg-white p-1.5"
	>
		<img src={props.element.thumb} alt="" draggable="false" class="max-h-full max-w-full object-contain" />
	</span>
	<span class="line-clamp-2 text-xs">{props.element.name}</span>
</button>
