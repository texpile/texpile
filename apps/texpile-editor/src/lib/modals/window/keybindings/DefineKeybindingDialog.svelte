<script lang="ts">
	import Modal from '../../Modal.svelte';
	import Kbd from '$lib/components/Kbd.svelte';
	import { isMac } from '$lib/platform';
	import { chordLabel } from '$lib/keybindings/keys/keyLabels';
	import { RECORDER_ATTR } from '$lib/keybindings/dispatch/keyDispatcher';
	import { plainKey, recordKey } from './keyRecorder';
	import type { KeybindingsPanel } from './keybindingsPanel.svelte';
	import { m } from '$lib/paraglide/messages';

	const props: { panel: KeybindingsPanel } = $props();
	const defining = $derived(props.panel.defining!);

	function onkeydown(e: KeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();
		if (plainKey(e, 'Escape')) props.panel.defining = null;
		else if (plainKey(e, 'Enter')) void props.panel.saveDefined();
		else props.panel.defining = { ...defining, keys: recordKey(defining.keys, e, isMac) };
	}
</script>

<Modal open title={defining.row.title} z="z-1400" onClose={() => (props.panel.defining = null)}>
	<p class="text-muted text-sm">{m.keybindings_define_prompt()}</p>
	<div
		class="input mt-3 flex h-10 items-center justify-center gap-1"
		role="textbox"
		tabindex="0"
		aria-label={m.keybindings_define_prompt()}
		{@attach (node) => node.focus()}
		{...{ [RECORDER_ATTR]: '' }}
		{onkeydown}
	>
		{#each defining.keys as chord, i (i)}<Kbd cap raw={chordLabel(chord)} />{/each}
	</div>
	{#if props.panel.clashes}
		<button type="button" class="anchor mt-2 text-xs" onclick={() => props.panel.showSameKeys(defining.keys)}>
			{props.panel.clashes === 1 ? m.keybindings_define_clashes_one() : m.keybindings_define_clashes_other({ count: props.panel.clashes })}
		</button>
	{/if}
</Modal>
