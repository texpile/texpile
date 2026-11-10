<script lang="ts">
	type WindowShotProps = { src: string; alt: string };
	const props: WindowShotProps = $props();
</script>

<img
	src={props.src}
	alt={props.alt}
	loading="lazy"
	draggable="false"
	class="block h-auto w-full [filter:drop-shadow(0_0_1px_rgb(0_0_0/0.45))_drop-shadow(0_24px_32px_rgb(0_0_0/0.2))]"
/>
