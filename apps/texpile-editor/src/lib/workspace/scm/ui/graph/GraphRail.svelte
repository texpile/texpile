<script lang="ts">
	// VS Code's own metrics - 22x22 cell, lane at x=11, node radius 4-5 - because the dot has to sit
	// exactly on the line or a column of rows visibly wobbles.
	//
	// One lane, though git log flattens a branching history into a date-ordered list, so a straight
	// lane claims a succession the repo may not have. Full swimlanes need the whole parent graph;
	// ringing the joins is the part of it that fits in 22 pixels.
	type Props = {
		above: boolean;
		below: boolean;
		node?: 'head' | 'version' | null;
		/** joined two lines of work, so the lane through it is a simplification */
		merge?: boolean;
	};
	let { above, below, node = null, merge = false }: Props = $props();
</script>

<svg width="22" height="22" viewBox="0 0 22 22" class="text-primary-ink shrink-0 self-start" aria-hidden="true">
	{#if above}<line x1="11" y1="0" x2="11" y2="11" stroke="currentColor" stroke-width="1" />{/if}
	{#if below}<line x1="11" y1="11" x2="11" y2="22" stroke="currentColor" stroke-width="1" />{/if}
	{#if merge && node}
		<circle cx="11" cy="11" r="9" fill="none" stroke="currentColor" stroke-width="1" opacity="0.5" />
	{/if}
	{#if node === 'head'}
		<!-- a ring, not VS Code's disc-with-a-hole: that hole is filled with the list background and
		     has to be repainted on hover -->
		<circle cx="11" cy="11" r="5.5" fill="none" stroke="currentColor" stroke-width="3" />
	{:else if node === 'version'}
		<circle cx="11" cy="11" r="5" fill="currentColor" />
	{/if}
</svg>
