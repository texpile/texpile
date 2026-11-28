<script lang="ts">
	import { SlidersHorizontal } from '@lucide/svelte';
	import MenuDropdown from '$lib/menus/MenuDropdown.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';
	import { readSharedPick, sharedOptionsMenu } from './configOptionMenu';
	import type { ConfigOption } from '../../agentPanel.types';

	type Props = { options: ConfigOption[]; onConfig: (id: string, value: string) => void };
	const props: Props = $props();
</script>

<MenuDropdown
	groups={sharedOptionsMenu(props.options)}
	placement="bottom-start"
	onSelect={(v) => {
		const pick = readSharedPick(v);
		props.onConfig(pick.id, pick.value);
	}}
>
	{#snippet trigger(attrs)}
		<button
			{...attrs}
			class="text-muted hover:bg-surface-200-800 rounded-base flex size-6 shrink-0 items-center justify-center transition-colors"
			aria-label={m.agent_panel_more_options()}
			use:tip={m.agent_panel_more_options()}
		>
			<SlidersHorizontal class="size-3.5" />
		</button>
	{/snippet}
</MenuDropdown>
