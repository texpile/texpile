<script lang="ts">
	import type { Drawing } from '../../drawing/drawing.types';
	import { TILE_COPIES, tileMatrix } from '../../drawing/patternTile';

	type Props = { drawing: Drawing; uid: string };
	const props: Props = $props();

	function clipUrl(id: string | null) {
		return id ? `url(#${props.uid}-${id})` : undefined;
	}
</script>

<defs>
	{#each props.drawing.gradients as g (g.id)}
		{#if g.kind === 'pattern'}
			{#if g.tile}
				{@const tile = g.tile}
				<pattern
					id="{props.uid}-{g.id}"
					patternUnits="userSpaceOnUse"
					width={tile.width}
					height={tile.height}
					patternTransform={tileMatrix(tile)}
				>
					{#each TILE_COPIES as [i, j] (`${i} ${j}`)}
						<g transform="translate({i * tile.width} {j * tile.height})">
							{#each tile.paths as p, n (n)}
								<path
									d={p.d}
									fill={p.fill ?? 'none'}
									fill-rule={p.evenOdd ? 'evenodd' : 'nonzero'}
									stroke={p.stroke ?? undefined}
									stroke-width={p.stroke ? p.strokeWidth : undefined}
									stroke-linecap={p.stroke ? p.cap : undefined}
									stroke-linejoin={p.stroke ? p.join : undefined}
								/>
							{/each}
						</g>
					{/each}
				</pattern>
			{/if}
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
