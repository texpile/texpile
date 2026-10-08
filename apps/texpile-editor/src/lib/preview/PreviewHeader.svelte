<script lang="ts">
	// the pane's row while its body brings no bar of its own: the same shell as the previews, with
	// nothing but the name, or the project's controls, and the popout on it
	import { PictureInPicture2 } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';
	import PreviewToolbar from './PreviewToolbar.svelte';

	import type { Snippet } from 'svelte';

	type Props = { label?: string; controls?: Snippet; onPopout?: (() => void) | null; asTabStrip?: boolean };
	let { label, controls, onPopout = null, asTabStrip = true }: Props = $props();
</script>

{#snippet leading()}
	<span class="truncate text-sm">{label}</span>
{/snippet}

<!-- no close button: docked, the divider's lozenge is the close (the control on the
     boundary it moves); popped out, the OS window's own close is right above -->
{#snippet popout()}
	<button onclick={() => onPopout?.()} use:tip={m.wsview_popout_preview()} aria-label={m.wsview_popout_preview()}>
		<PictureInPicture2 size={16} />
	</button>
{/snippet}

<PreviewToolbar groups={[]} leading={controls ?? leading} trailing={onPopout ? popout : undefined} {asTabStrip} />
