<script lang="ts">
	import type { DrawMode, ShapeFamily } from '../state/drawModes/drawModes';

	type Props = { family: ShapeFamily; mode: DrawMode; class?: string };
	const props: Props = $props();

	// the points each mode is drawn by, marked as CAD's flyouts mark them
	const DOTS: Record<string, [number, number][]> = {
		'rect corners': [
			[4, 18],
			[20, 6]
		],
		'rect center': [
			[12, 12],
			[20, 6]
		],
		'rect threePoints': [
			[4, 15],
			[13, 6],
			[20, 13]
		],
		'round corners': [
			[3, 6],
			[21, 18]
		],
		'round center': [
			[12, 12],
			[21, 18]
		],
		'round circleCenter': [
			[12, 12],
			[17.7, 6.3]
		],
		'round circleTwoPoints': [
			[4, 12],
			[20, 12]
		],
		'round circleThreePoints': [
			[5.1, 16],
			[18.9, 16],
			[12, 4]
		]
	};
	const key = $derived(`${props.family} ${props.mode}`);
	const circle = $derived(props.family === 'round' && props.mode.startsWith('circle'));
</script>

<svg viewBox="0 0 24 24" class={props.class} fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
	{#if props.family === 'rect'}
		{#if props.mode === 'threePoints'}
			<path d="M4 15 13 6 20 13 11 22Z" />
		{:else}
			<rect x="4" y="6" width="16" height="12" rx="0.5" />
		{/if}
	{:else if circle}
		<circle cx="12" cy="12" r="8" />
		{#if props.mode === 'circleTwoPoints'}<path d="M4 12h16" stroke-dasharray="2 2" />{/if}
	{:else}
		<ellipse cx="12" cy="12" rx="9" ry="6" />
		<rect x="3" y="6" width="18" height="12" stroke-width="1" stroke-dasharray="2 2" opacity="0.5" />
	{/if}
	{#each DOTS[key] ?? [] as [x, y] (`${x} ${y}`)}
		<circle cx={x} cy={y} r="2" fill="currentColor" stroke="none" />
	{/each}
</svg>
