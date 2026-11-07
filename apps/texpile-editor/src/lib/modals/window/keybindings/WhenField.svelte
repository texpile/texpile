<script lang="ts">
	import { untrack } from 'svelte';
	import { parseWhen, printWhen, WhenSyntaxError, type WhenExpression } from '$lib/keybindings/when/whenExpression';
	import { m } from '$lib/paraglide/messages';

	const props: { when: WhenExpression | null; onSave: (when: WhenExpression | null) => void; onCancel: () => void } = $props();
	// the clause as editing starts; the row closes the field before its own when changes
	let text = $state(untrack(() => (props.when ? printWhen(props.when) : '')));
	let error = $state('');

	function save(): void {
		try {
			const read = parseWhen(text);
			props.onSave(read.kind === 'true' ? null : read);
		} catch (e) {
			if (!(e instanceof WhenSyntaxError)) throw e;
			error = m.keybindings_when_invalid({ message: e.message });
		}
	}
</script>

<input
	bind:value={text}
	class="input h-7 w-full font-mono text-xs"
	placeholder={m.keybindings_when_placeholder()}
	aria-label={m.keybindings_change_when()}
	spellcheck="false"
	{@attach (node) => node.focus()}
	oninput={() => (error = '')}
	onkeydown={(e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			save();
		} else if (e.key === 'Escape') {
			e.stopPropagation();
			props.onCancel();
		}
	}}
	onblur={() => props.onCancel()}
/>
{#if error}<p class="text-error-ink mt-1 text-xs">{error}</p>{/if}
