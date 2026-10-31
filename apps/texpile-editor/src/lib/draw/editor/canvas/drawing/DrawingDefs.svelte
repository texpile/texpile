<script lang="ts">
	import type { Drawing } from '../../drawing/drawing.types';

	type Props = { drawing: Drawing; uid: string };
	const props: Props = $props();

	function clipUrl(id: string | null) {
		return id ? `url(#${props.uid}-${id})` : undefined;
	}
</script>

<defs>
	{#each props.drawing.gradients as g (g.id)}
		{#if g.kind === 'hatch'}
			<pattern id="{props.uid}-{g.id}" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(-45)">
				<rect width="0.8" height="4" fill={g.stops[0].color} />
			</pattern>
		{:else if g.kind === 'linear'}
			<linearGradient
				id="{props.uid}-{g.id}"
				gradientUnits="userSpaceOnUse"
				x1={g.from[0]}
				y1={g.from[1]}
				x2={g.to[0]}
				y2={g.to[1]}
				gradientTransform="matrix({g.transform.join(' ')})"
			>
				{#each g.stops as s, n (n)}<stop offset={s.offset} stop-color={s.color} />{/each}
			</linearGradient>
		{:else}
			<radialGradient
				id="{props.uid}-{g.id}"
				gradientUnits="userSpaceOnUse"
				cx={g.from[0]}
				cy={g.from[1]}
				r={g.radius}
				fx={g.focus[0]}
				fy={g.focus[1]}
				gradientTransform="matrix({g.transform.join(' ')})"
			>
				{#each g.stops as s, n (n)}<stop offset={s.offset} stop-color={s.color} />{/each}
			</radialGradient>
		{/if}
	{/each}
	{#each props.drawing.clips as c (c.id)}
		<clipPath id="{props.uid}-{c.id}" clip-path={clipUrl(c.parent)}>
			<path d={c.d} clip-rule={c.evenOdd ? 'evenodd' : 'nonzero'} />
		</clipPath>
	{/each}
</defs>
