<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ArrowDownWideNarrow, Keyboard, ListX } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { isMac } from '$lib/platform';
	import { keysText, type KeySequence } from '$lib/keybindings/keys/keyChord';
	import { RECORDER_ATTR } from '$lib/keybindings/dispatch/keyDispatcher';
	import { plainKey, recordKey } from './keyRecorder';
	import type { KeybindingsPanel } from './keybindingsPanel.svelte';
	import { m } from '$lib/paraglide/messages';

	const props: { panel: KeybindingsPanel; actions?: Snippet } = $props();
	let input = $state<HTMLInputElement | null>(null);
	let recorded: KeySequence = [];

	function toggleRecording(): void {
		props.panel.recording = !props.panel.recording;
		recorded = [];
		input?.focus();
	}

	function clear(): void {
		props.panel.query = '';
		input?.focus();
	}

	function onkeydown(e: KeyboardEvent): void {
		if (!props.panel.recording) {
			if (plainKey(e, 'Escape') && props.panel.query) {
				e.stopPropagation();
				props.panel.query = '';
			}
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		if (plainKey(e, 'Escape')) {
			props.panel.recording = false;
			return;
		}
		recorded = recordKey(recorded, e, isMac);
		if (recorded.length) props.panel.query = `"${keysText(recorded)}"`;
	}
</script>

<div class="input flex min-w-0 flex-1 items-center gap-0.5 py-1 pr-1 text-sm">
	<input
		bind:this={input}
		bind:value={props.panel.query}
		class="min-w-0 flex-1 bg-transparent outline-none"
		placeholder={props.panel.recording ? m.keybindings_recording_placeholder() : m.keybindings_search_placeholder()}
		aria-label={m.keybindings_search_placeholder()}
		spellcheck="false"
		readonly={props.panel.recording}
		{...{ [RECORDER_ATTR]: props.panel.recording ? '' : undefined }}
		{onkeydown}
		onblur={() => (props.panel.recording = false)}
	/>
	<button
		type="button"
		class="btn-icon btn-icon-sm shrink-0 {props.panel.recording ? 'preset-tonal-primary' : 'hover:preset-tonal'}"
		aria-pressed={props.panel.recording}
		aria-label={m.keybindings_record_keys()}
		use:tip={m.keybindings_record_keys()}
		onmousedown={(e) => e.preventDefault()}
		onclick={toggleRecording}><Keyboard class="size-4" /></button
	>
	<button
		type="button"
		class="btn-icon btn-icon-sm shrink-0 {props.panel.byPrecedence ? 'preset-tonal-primary' : 'hover:preset-tonal'}"
		aria-pressed={props.panel.byPrecedence}
		aria-label={m.keybindings_sort_precedence()}
		use:tip={m.keybindings_sort_precedence()}
		onclick={() => (props.panel.byPrecedence = !props.panel.byPrecedence)}><ArrowDownWideNarrow class="size-4" /></button
	>
	<button
		type="button"
		class="btn-icon btn-icon-sm hover:preset-tonal shrink-0"
		disabled={!props.panel.query}
		aria-label={m.keybindings_clear_search()}
		use:tip={m.keybindings_clear_search()}
		onclick={clear}><ListX class="size-4" /></button
	>
	{@render props.actions?.()}
</div>
