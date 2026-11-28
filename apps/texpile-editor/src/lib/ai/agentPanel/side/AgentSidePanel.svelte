<script lang="ts">
	// the Agent panel as a column at the window's right edge, beside the document and the PDF
	import { PanelBottom, X } from '@lucide/svelte';
	import PaneSplitter from '$lib/components/PaneSplitter.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';
	import AgentPanel from '../ui/AgentPanel.svelte';
	import AgentStripControls from '../ui/strip/AgentStripControls.svelte';
	import DockTabCount from '$lib/terminal/DockTabCount.svelte';
	import { agentSession } from '../agentSession.svelte';
	import { agentSide, sideWidthIn, type SideRoom } from './agentSide.svelte';

	type Props = {
		onOpenTerminal: () => void;
		onMoveToBottom: () => void;
		room: SideRoom;
		/** the width the panel takes from the window, 0 once it goes */
		onWidth: (width: number) => void;
	};
	const props: Props = $props();
	const width = $derived(sideWidthIn(agentSide.width, props.room));

	$effect(() => {
		props.onWidth(width);
		return () => props.onWidth(0);
	});
</script>

<PaneSplitter
	resizable
	resizeLabel={m.agent_side_resize_aria()}
	onStartResize={(e) => agentSide.startResize(e, props.room)}
	onResizeByKey={(e) => agentSide.resizeByKey(e, props.room)}
	class="z-30"
/>
<aside class="flex min-h-0 shrink-0 flex-col" style="width: {width}px">
	<!-- h-9, the tab strip's height, so the two read as one row -->
	<div class="bg-surface-100-900 border-surface-200-800 flex h-9 shrink-0 items-center gap-2 border-b px-2 text-xs">
		<span class="flex min-w-0 flex-1 items-center gap-1 px-1 text-sm font-medium">
			<span class="cap-center truncate">{m.agent_panel_tab()}</span>
			{#if agentSession.asks.length > 0}
				<DockTabCount count={agentSession.asks.length} tone="warning" />
			{/if}
		</span>
		<div class="flex shrink-0 items-center gap-0.5">
			<AgentStripControls />
			<button
				class="btn-icon btn-icon-xs hover:preset-tonal"
				use:tip={m.agent_side_to_bottom()}
				aria-label={m.agent_side_to_bottom()}
				onclick={props.onMoveToBottom}
			>
				<PanelBottom class="size-3.5" />
			</button>
			<button
				class="btn-icon btn-icon-xs hover:preset-tonal"
				use:tip={m.agent_side_hide()}
				aria-label={m.agent_side_hide()}
				onclick={() => agentSide.setOpen(false)}
			>
				<X class="size-3.5" />
			</button>
		</div>
	</div>
	<div class="bg-surface-50-950 relative min-h-0 flex-1 overflow-hidden">
		<AgentPanel onOpenTerminal={props.onOpenTerminal} />
	</div>
</aside>
