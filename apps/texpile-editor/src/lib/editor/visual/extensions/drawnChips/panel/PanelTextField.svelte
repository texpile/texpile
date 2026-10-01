<script lang="ts">
	import SuggestInput from '$lib/menus/SuggestInput.svelte';

	type Props = {
		value: string;
		label: string;
		oninput: (value: string) => void;
		mono?: boolean;
		autofocus?: boolean;
		/** values offered to pick, opened from the field's chevron or as the reader types */
		suggestions?: readonly string[];
		placeholder?: string;
	};

	const props: Props = $props();
</script>

<SuggestInput
	class="border-surface-300-700 rounded-base focus:border-primary-500 h-7 w-full min-w-0 border bg-transparent px-2 text-sm outline-none {props.mono
		? 'font-mono'
		: ''}"
	spellcheck="false"
	aria-label={props.label}
	placeholder={props.placeholder}
	data-autofocus={props.autofocus ? '' : undefined}
	value={props.value}
	suggestions={props.suggestions ?? []}
	oninput={props.oninput}
/>
